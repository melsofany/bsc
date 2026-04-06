import { db } from "@workspace/db";
import {
  botStateTable,
  botConfigTable,
  opportunitiesTable,
  tradesTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { simulateArbitrage, executeArbitrageLive } from "./executor.js";
import { fetchDexPairsForToken, detectArbitrageFromPairs, fetchCoinGeckoPrices } from "./prices.js";
import { fetchBscGasPrice } from "./blockchain.js";
import { logger } from "./logger.js";

let running = false;
let scanInterval: ReturnType<typeof setInterval> | null = null;
let executeInterval: ReturnType<typeof setInterval> | null = null;

async function getBotState() {
  const rows = await db.select().from(botStateTable).orderBy(desc(botStateTable.id)).limit(1);
  return rows[0] ?? null;
}

async function getBotConfig() {
  const rows = await db.select().from(botConfigTable).orderBy(desc(botConfigTable.id)).limit(1);
  return rows[0] ?? null;
}

async function scanForOpportunities() {
  try {
    const state = await getBotState();
    if (!state?.running) return;

    logger.info("Auto-trader: scanning for new opportunities");

    const [wbnbPairs, btcbPairs, cakePairs, ethPairs, gasPrice, cgPrices] = await Promise.all([
      fetchDexPairsForToken("WBNB"),
      fetchDexPairsForToken("BTCB"),
      fetchDexPairsForToken("CAKE"),
      fetchDexPairsForToken("ETH"),
      fetchBscGasPrice(),
      fetchCoinGeckoPrices(),
    ]);

    const allPairs = [...wbnbPairs, ...btcbPairs, ...cakePairs, ...ethPairs];
    const bnbPrice = cgPrices["BNB"] ?? cgPrices["WBNB"] ?? 600;
    const opportunities = detectArbitrageFromPairs(allPairs, gasPrice, bnbPrice);

    if (opportunities.length > 0) {
      const toInsert = opportunities.slice(0, 6).map((op) => ({
        strategy: op.strategy,
        tokenPair: op.tokenPair,
        buyDex: op.buyDex,
        sellDex: op.sellDex,
        buyPrice: op.buyPrice.toFixed(8),
        sellPrice: op.sellPrice.toFixed(8),
        profitEstimate: op.profitUsd.toFixed(4),
        profitPercent: op.profitPercent.toFixed(4),
        gasEstimate: op.gasEstimateUsd.toFixed(4),
        netProfit: op.netProfitUsd.toFixed(4),
        status: "detected" as const,
        detectedAt: op.detectedAt,
        amountIn: op.amountIn.toFixed(2),
        flashLoanUsed: op.strategy === "flash_loan",
      }));

      await db.insert(opportunitiesTable).values(toInsert).catch((e) => {
        logger.warn(e, "Auto-trader: could not insert opportunities");
      });

      logger.info({ count: toInsert.length }, "Auto-trader: inserted new opportunities");
    }
  } catch (err) {
    logger.warn(err, "Auto-trader: scan failed");
  }
}

async function executeDetectedOpportunities() {
  try {
    const [state, config] = await Promise.all([getBotState(), getBotConfig()]);
    if (!state?.running || !config) return;

    const detected = await db
      .select()
      .from(opportunitiesTable)
      .where(eq(opportunitiesTable.status, "detected"))
      .orderBy(desc(opportunitiesTable.detectedAt))
      .limit(3);

    if (detected.length === 0) return;

    logger.info({ count: detected.length }, "Auto-trader: executing opportunities");

    for (const opportunity of detected) {
      try {
        const isLive = state.mode === "live" && config.mode === "live";
        const flashbotsEnabled = config.flashbotsEnabled ?? false;
        const network = state.network ?? config.network ?? "bsc";

        let result;

        if (isLive && state.walletPrivateKey && config.contractAddress) {
          result = await executeArbitrageLive({
            privateKey: state.walletPrivateKey,
            contractAddress: config.contractAddress,
            network,
            tokenPair: opportunity.tokenPair,
            buyDex: opportunity.buyDex ?? "pancakeswap_v2",
            sellDex: opportunity.sellDex ?? "biswap",
            flashLoanAmount: opportunity.amountIn ?? "10000",
            flashbotsEnabled,
          });
        } else {
          result = await simulateArbitrage({
            tokenPair: opportunity.tokenPair,
            buyDex: opportunity.buyDex ?? "pancakeswap_v2",
            sellDex: opportunity.sellDex ?? "biswap",
            profitEstimate: opportunity.profitEstimate ?? "0",
            gasEstimate: opportunity.gasEstimate ?? "0",
            netProfit: opportunity.netProfit ?? "0",
            network,
            flashLoanAmount: opportunity.amountIn ?? "10000",
            flashbotsEnabled,
          });
        }

        const tradeStatus = result.success ? "confirmed" : "failed";
        const executedAt = new Date();

        // Use real gas and profit from execution result
        const realGasCostUsd = result.gasCostUsd ? parseFloat(result.gasCostUsd) : 0;
        const realProfitUsd = result.profitUsd ? parseFloat(result.profitUsd) : 0;
        const realNetProfitUsd = (realProfitUsd - realGasCostUsd).toFixed(4);

        await db
          .update(opportunitiesTable)
          .set({
            status: result.success ? "executed" : "failed",
            executedAt,
            txHash: result.txHash ?? null,
            // Update the opportunity with actual data
            gasEstimate: result.gasUsed ? (parseFloat(result.gasUsed) * 0.00000000005 * 600).toFixed(4) : opportunity.gasEstimate,
            netProfit: realNetProfitUsd,
          })
          .where(eq(opportunitiesTable.id, opportunity.id));

        await db.insert(tradesTable).values({
          opportunityId: opportunity.id,
          txHash: result.txHash ?? null,
          strategy: opportunity.strategy,
          tokenPair: opportunity.tokenPair,
          amountIn: opportunity.amountIn ?? null,
          amountOut: null,
          profit: result.profitEth ?? "0",
          profitUsd: realProfitUsd.toFixed(4),
          gasUsed: result.gasUsed ?? "0",
          gasCost: result.gasCostEth ?? "0",
          gasCostUsd: realGasCostUsd.toFixed(4),
          netProfitUsd: realNetProfitUsd,
          status: tradeStatus,
          blockNumber: result.blockNumber ?? null,
          executedAt,
          confirmedAt: result.success ? new Date() : null,
          flashLoanAmount: opportunity.amountIn ?? null,
          flashLoanFee: null,
          buyDex: opportunity.buyDex ?? null,
          sellDex: opportunity.sellDex ?? null,
          error: result.error ?? null,
        });

        logger.info(
          { opportunityId: opportunity.id, success: result.success, profitUsd: result.profitUsd },
          "Auto-trader: trade executed"
        );
      } catch (err) {
        logger.warn({ opportunityId: opportunity.id, err }, "Auto-trader: failed to execute opportunity");
      }
    }
  } catch (err) {
    logger.warn(err, "Auto-trader: execute loop failed");
  }
}

export function startAutoTrader() {
  if (running) return;
  running = true;

  logger.info("Auto-trader: starting opportunity scanner (manual execution only)");

  // Only scan for opportunities — execution is manual (user clicks Execute)
  scanInterval = setInterval(scanForOpportunities, 30_000);
}

export function stopAutoTrader() {
  if (scanInterval) clearInterval(scanInterval);
  if (executeInterval) clearInterval(executeInterval);
  running = false;
  logger.info("Auto-trader: stopped");
}
