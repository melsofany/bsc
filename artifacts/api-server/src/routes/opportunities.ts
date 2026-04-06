import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { opportunitiesTable, botStateTable } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import {
  ListOpportunitiesQueryParams,
  ListOpportunitiesResponse,
  GetLiveOpportunitiesResponse,
} from "@workspace/api-zod";
import { fetchDexPairsForToken, detectArbitrageFromPairs, fetchCoinGeckoPrices } from "../lib/prices.js";
import { fetchBscGasPrice } from "../lib/blockchain.js";

const router: IRouter = Router();
const LIVE_SCAN_TOKENS = ["WBNB", "BTCB", "CAKE", "ETH", "XVS", "ALPACA", "BSW", "BAKE", "ADA", "DOT", "LINK", "LTC"];

function mapOpp(r: typeof opportunitiesTable.$inferSelect) {
  return {
    ...r,
    buyPrice: r.buyPrice ?? undefined,
    sellPrice: r.sellPrice ?? undefined,
    profitEstimate: r.profitEstimate ?? "0",
    profitPercent: r.profitPercent ?? undefined,
    gasEstimate: r.gasEstimate ?? undefined,
    netProfit: r.netProfit ?? undefined,
    txHash: r.txHash ?? undefined,
    amountIn: r.amountIn ?? undefined,
    slippage: r.slippage ?? undefined,
    detectedAt: r.detectedAt.toISOString(),
    executedAt: r.executedAt?.toISOString() ?? undefined,
    buyDex: r.buyDex ?? undefined,
    sellDex: r.sellDex ?? undefined,
  };
}

async function isBotRunning(): Promise<boolean> {
  const rows = await db
    .select({ running: botStateTable.running })
    .from(botStateTable)
    .orderBy(desc(botStateTable.id))
    .limit(1);
  return rows[0]?.running ?? false;
}

router.get("/opportunities", async (req, res): Promise<void> => {
  const parsed = ListOpportunitiesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { limit = 50, status, strategy } = parsed.data;
  const conditions = [];
  if (status) conditions.push(eq(opportunitiesTable.status, status));
  if (strategy) conditions.push(eq(opportunitiesTable.strategy, strategy));

  const rows = await db
    .select()
    .from(opportunitiesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(opportunitiesTable.detectedAt))
    .limit(limit ?? 50);

  res.json(ListOpportunitiesResponse.parse(rows.map(mapOpp)));
});

router.get("/opportunities/live", async (req, res): Promise<void> => {
  try {
    const botRunning = await isBotRunning();

    const [pairArrays, gasPrice, cgPrices] = await Promise.all([
      Promise.all(LIVE_SCAN_TOKENS.map((token) => fetchDexPairsForToken(token))),
      fetchBscGasPrice(),
      fetchCoinGeckoPrices(),
    ]);

    const allPairs = pairArrays.flat();
    const bnbPrice = cgPrices["BNB"] ?? cgPrices["WBNB"] ?? 600;
    const opportunities = detectArbitrageFromPairs(allPairs, gasPrice, bnbPrice);

    if (botRunning && opportunities.length > 0) {
      const toInsert = opportunities.slice(0, 8).map((op) => ({
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

      try {
        await db.insert(opportunitiesTable).values(toInsert);
      } catch (e) {
        req.log.warn(e, "Could not insert opportunities");
      }
    }

    if (botRunning) {
      const liveOps = await db
        .select()
        .from(opportunitiesTable)
        .where(eq(opportunitiesTable.status, "detected"))
        .orderBy(desc(opportunitiesTable.detectedAt))
        .limit(10);

      if (liveOps.length > 0) {
        res.json(GetLiveOpportunitiesResponse.parse(liveOps.map(mapOpp)));
        return;
      }
    }

    if (opportunities.length > 0) {
      const fallback = opportunities.slice(0, 8).map((op, i) => ({
        id: -(i + 1),
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
        detectedAt: op.detectedAt.toISOString(),
        executedAt: undefined,
        amountIn: op.amountIn.toFixed(2),
        flashLoanUsed: op.strategy === "flash_loan",
        txHash: undefined,
        slippage: undefined,
      }));
      res.json(GetLiveOpportunitiesResponse.parse(fallback));
      return;
    }

    res.json(GetLiveOpportunitiesResponse.parse([]));
  } catch (err) {
    req.log.error(err, "Failed to fetch live opportunities");
    const liveOps = await db
      .select()
      .from(opportunitiesTable)
      .where(eq(opportunitiesTable.status, "detected"))
      .orderBy(desc(opportunitiesTable.detectedAt))
      .limit(10);
    res.json(GetLiveOpportunitiesResponse.parse(liveOps.map(mapOpp)));
  }
});

export default router;
