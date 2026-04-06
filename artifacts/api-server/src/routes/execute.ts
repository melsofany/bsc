import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  botStateTable,
  botConfigTable,
  opportunitiesTable,
  tradesTable,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { simulateArbitrage, executeArbitrageLive } from "../lib/executor.js";

const router: IRouter = Router();

async function getState() {
  const rows = await db.select().from(botStateTable).orderBy(desc(botStateTable.id)).limit(1);
  return rows[0] ?? null;
}

async function getConfig() {
  const rows = await db.select().from(botConfigTable).orderBy(desc(botConfigTable.id)).limit(1);
  return rows[0] ?? null;
}

router.post("/execute/:opportunityId", async (req, res): Promise<void> => {
  const opportunityId = parseInt(req.params.opportunityId ?? "0");

  if (isNaN(opportunityId) || opportunityId <= 0) {
    res.status(400).json({ error: "Invalid opportunity ID" });
    return;
  }

  const [state, config] = await Promise.all([getState(), getConfig()]);

  if (!state || !config) {
    res.status(400).json({ error: "Bot not initialized" });
    return;
  }

  const opportunityRows = await db
    .select()
    .from(opportunitiesTable)
    .where(eq(opportunitiesTable.id, opportunityId))
    .limit(1);

  if (!opportunityRows.length) {
    res.status(400).json({ error: "Opportunity not found" });
    return;
  }

  const opportunity = opportunityRows[0]!;

  if (opportunity.status === "executed") {
    res.status(400).json({ error: "Opportunity already executed" });
    return;
  }

  const isLive = config.mode === "live" && state.mode === "live";
  let result;

  const flashbotsEnabled = config.flashbotsEnabled ?? false;
  const network = (state.network ?? config.network ?? "bsc") as string;

  if (isLive) {
    if (!state.walletPrivateKey) {
      res.status(400).json({ error: "No wallet connected. Connect a wallet first in Settings." });
      return;
    }
    if (!config.contractAddress) {
      res.status(400).json({ error: "No smart contract configured. Add contract address in Settings." });
      return;
    }

    result = await executeArbitrageLive({
      privateKey: state.walletPrivateKey,
      contractAddress: config.contractAddress,
      network: state.network,
      tokenPair: opportunity.tokenPair,
      buyDex: opportunity.buyDex ?? "biswap",
      sellDex: opportunity.sellDex ?? "babyswap",
      flashLoanAmount: opportunity.amountIn ?? "10000",
      flashbotsEnabled,
    });
  } else {
    result = await simulateArbitrage({
      tokenPair: opportunity.tokenPair,
      buyDex: opportunity.buyDex ?? "biswap",
      sellDex: opportunity.sellDex ?? "babyswap",
      profitEstimate: opportunity.profitEstimate ?? "0",
      gasEstimate: opportunity.gasEstimate ?? "0",
      netProfit: opportunity.netProfit ?? "0",
      network: state.network,
      flashLoanAmount: opportunity.amountIn ?? "10000",
      flashbotsEnabled,
    });
  }

  const tradeStatus = result.success ? "confirmed" : "failed";
  const executedAt = new Date();

  await db
    .update(opportunitiesTable)
    .set({
      status: result.success ? "executed" : "failed",
      executedAt,
      txHash: result.txHash ?? null,
    })
    .where(eq(opportunitiesTable.id, opportunityId));

  const grossProfitUsd = result.profitUsd ? parseFloat(result.profitUsd) : null;
  const gasUsd = result.gasCostUsd ? parseFloat(result.gasCostUsd) : 0;
  const netProfitUsd = grossProfitUsd !== null ? (grossProfitUsd - gasUsd).toFixed(4) : null;

  const [trade] = await db
    .insert(tradesTable)
    .values({
      opportunityId,
      txHash: result.txHash ?? null,
      strategy: opportunity.strategy,
      tokenPair: opportunity.tokenPair,
      amountIn: opportunity.amountIn ?? null,
      amountOut: null,
      profit: result.profitEth ?? null,
      profitUsd: grossProfitUsd !== null ? grossProfitUsd.toFixed(4) : null,
      gasUsed: result.gasUsed ?? null,
      gasCost: result.gasCostEth ?? null,
      gasCostUsd: result.gasCostUsd ? parseFloat(result.gasCostUsd).toFixed(4) : null,
      netProfitUsd,
      status: tradeStatus,
      blockNumber: result.blockNumber ?? null,
      executedAt,
      confirmedAt: result.success ? new Date() : null,
      flashLoanAmount: opportunity.amountIn ?? null,
      flashLoanFee: null,
      buyDex: opportunity.buyDex ?? null,
      sellDex: opportunity.sellDex ?? null,
      buyPrice: opportunity.buyPrice ?? null,
      sellPrice: opportunity.sellPrice ?? null,
      error: result.error ?? null,
    })
    .returning();

  res.json({
    success: result.success,
    txHash: result.txHash,
    blockNumber: result.blockNumber,
    gasUsed: result.gasUsed,
    gasCostEth: result.gasCostEth,
    gasCostUsd: result.gasCostUsd,
    profitEth: result.profitEth,
    profitUsd: result.profitUsd,
    error: result.error,
    simulated: result.simulated,
    mevProtected: result.mevProtected ?? false,
    relay: result.relay,
    bundleStats: result.bundleStats,
    opportunityId,
    tradeId: trade?.id,
  });
});

export default router;
