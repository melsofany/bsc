import { db } from "@workspace/db";
import {
  botStateTable,
  botConfigTable,
  opportunitiesTable,
  tradesTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { simulateArbitrage, executeArbitrageLive } from "./executor.js";
import { fetchDexPairsForToken, detectArbitrageFromPairs, fetchCoinGeckoPrices } from "./prices.js";
import { scanOnChainOpportunities, updateTokenPrices } from "./onchain.js";
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

// Extra tokens for DexScreener API scanner (supplemental to on-chain scanner)
const DEXSCREENER_TOKENS = [
  "WBNB", "BTCB", "ETH", "CAKE",
  "XVS", "ALPACA", "BSW", "BAKE",
  "ADA", "DOT", "LINK", "LTC",
];

async function scanForOpportunities() {
  try {
    const state = await getBotState();
    if (!state?.running) return;

    logger.info("Auto-trader: scanning for new opportunities (on-chain + API)");

    const [cgPrices, gasPrice] = await Promise.all([
      fetchCoinGeckoPrices(),
      fetchBscGasPrice(),
    ]);

    const bnbPrice = cgPrices["BNB"] ?? cgPrices["WBNB"] ?? 600;

    // Keep on-chain scanner prices up-to-date
    updateTokenPrices({
      WBNB: cgPrices["WBNB"] ?? cgPrices["BNB"] ?? 600,
      BTCB: cgPrices["BTCB"] ?? 65000,
      ETH:  cgPrices["ETH"]  ?? 3000,
      CAKE: cgPrices["CAKE"] ?? 2,
      USDT: cgPrices["USDT"] ?? 1,
      BUSD: cgPrices["BUSD"] ?? 1,
    });

    // Gas cost estimate for flash loan transactions (~380k gas @ current gas price)
    const gasCostUsd = gasPrice * 380_000 * 1e-9 * bnbPrice;

    // Run both scanners in parallel: on-chain (accurate) + DexScreener (broad)
    const [onChainOpps, ...dexScreenerPairArrays] = await Promise.all([
      scanOnChainOpportunities(bnbPrice, gasCostUsd),
      ...DEXSCREENER_TOKENS.map((t) => fetchDexPairsForToken(t)),
    ]);

    const allDexPairs = dexScreenerPairArrays.flat();
    const apiOpps = detectArbitrageFromPairs(allDexPairs, gasPrice, bnbPrice);

    // Merge: on-chain results first (more accurate), then API results
    // De-duplicate by tokenPair+buyDex+sellDex
    const seen = new Set<string>();
    const merged = [...onChainOpps, ...apiOpps].filter((op) => {
      const key = `${op.tokenPair}|${op.buyDex}|${op.sellDex}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    logger.info(
      { onChain: onChainOpps.length, api: apiOpps.length, merged: merged.length },
      "Auto-trader: opportunities found"
    );

    if (merged.length === 0) return;

    const toInsert = merged.slice(0, 10).map((op) => ({
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

        const realGasCostUsd = result.gasCostUsd ? parseFloat(result.gasCostUsd) : 0;
        const realProfitUsd = result.profitUsd ? parseFloat(result.profitUsd) : 0;
        const realNetProfitUsd = (realProfitUsd - realGasCostUsd).toFixed(4);

        await db
          .update(opportunitiesTable)
          .set({
            status: result.success ? "executed" : "failed",
            executedAt,
            txHash: result.txHash ?? null,
            gasEstimate: result.gasUsed
              ? (parseFloat(result.gasUsed) * 0.00000000005 * 600).toFixed(4)
              : opportunity.gasEstimate,
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

  logger.info("Auto-trader: starting opportunity scanner (on-chain + DexScreener)");

  // Scan every 20s (on-chain scanner is fast enough for this cadence)
  scanInterval = setInterval(scanForOpportunities, 20_000);
}

export function stopAutoTrader() {
  if (scanInterval) clearInterval(scanInterval);
  if (executeInterval) clearInterval(executeInterval);
  running = false;
  logger.info("Auto-trader: stopped");
}
