import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tradesTable, opportunitiesTable, botStateTable, mempoolStatsTable } from "@workspace/db";
import { desc, eq, sql, and, gte } from "drizzle-orm";
import {
  GetAnalyticsSummaryResponse,
  GetPnlHistoryQueryParams,
  GetPnlHistoryResponse,
  GetStrategyStatsResponse,
  GetGasStatsResponse,
  GetMempoolStatsResponse,
} from "@workspace/api-zod";
import { fetchEthGasPrice, fetchPendingTxCount, fetchEthBlockNumber } from "../lib/blockchain.js";

const router: IRouter = Router();

router.get("/analytics/summary", async (req, res): Promise<void> => {
  const allTrades = await db.select().from(tradesTable);
  const allOpps = await db.select().from(opportunitiesTable);

  const totalTrades = allTrades.length;
  const successfulTrades = allTrades.filter((t) => t.status === "confirmed").length;
  const failedTrades = allTrades.filter((t) => t.status !== "confirmed").length;
  const successRate = totalTrades > 0
    ? ((successfulTrades / totalTrades) * 100).toFixed(1)
    : "0";

  let totalProfit = 0;
  let totalGas = 0;
  let bestTrade = 0;
  let totalVol = 0;

  for (const t of allTrades) {
    const p = parseFloat(t.netProfitUsd ?? "0");
    const g = parseFloat(t.gasCostUsd ?? "0");
    totalProfit += p;
    totalGas += g;
    if (p > bestTrade) bestTrade = p;
    totalVol += parseFloat(t.amountIn ?? "0");
  }

  const avgProfit = totalTrades > 0 ? totalProfit / totalTrades : 0;
  const ethPrice = 3400;

  totalVol = Math.min(totalVol, 1e12);
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);

  const todayTrades = allTrades.filter((t) => new Date(t.executedAt) >= startOfDay);
  const weekTrades = allTrades.filter((t) => new Date(t.executedAt) >= startOfWeek);

  const profitToday = todayTrades.reduce((acc, t) => acc + parseFloat(t.netProfitUsd ?? "0"), 0);
  const profitWeek = weekTrades.reduce((acc, t) => acc + parseFloat(t.netProfitUsd ?? "0"), 0);

  const opsDetected = allOpps.length;
  const opsExecuted = allOpps.filter((o) => o.status === "executed").length;
  const execRate = opsDetected > 0 ? ((opsExecuted / opsDetected) * 100).toFixed(1) : "0";

  const data = {
    totalProfit: totalProfit.toFixed(2),
    totalProfitEth: (totalProfit / ethPrice).toFixed(6),
    totalTrades,
    successfulTrades,
    failedTrades,
    successRate: `${successRate}%`,
    totalGasSpent: totalGas.toFixed(2),
    avgProfitPerTrade: avgProfit.toFixed(2),
    bestTrade: bestTrade.toFixed(2),
    opportunitiesDetected: opsDetected,
    opportunitiesExecuted: opsExecuted,
    executionRate: `${execRate}%`,
    totalVolumeUsd: totalVol.toFixed(2),
    profitToday: profitToday.toFixed(2),
    profitThisWeek: profitWeek.toFixed(2),
  };

  res.json(GetAnalyticsSummaryResponse.parse(data));
});

router.get("/analytics/pnl", async (req, res): Promise<void> => {
  const parsed = GetPnlHistoryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const period = parsed.data.period ?? "24h";
  const periodMs: Record<string, number> = {
    "1h": 3600000, "6h": 21600000, "24h": 86400000, "7d": 604800000, "30d": 2592000000,
  };
  const ms = periodMs[period] ?? 86400000;
  const since = new Date(Date.now() - ms);

  const trades = await db
    .select()
    .from(tradesTable)
    .where(gte(tradesTable.executedAt, since))
    .orderBy(tradesTable.executedAt);

  const buckets = 20;
  const bucketSize = ms / buckets;
  const dataPoints = [];
  let cumulative = 0;

  for (let i = 0; i < buckets; i++) {
    const bucketStart = since.getTime() + i * bucketSize;
    const bucketEnd = bucketStart + bucketSize;
    const bucketTrades = trades.filter((t) => {
      const ts = new Date(t.executedAt).getTime();
      return ts >= bucketStart && ts < bucketEnd;
    });
    const periodPnl = bucketTrades.reduce((acc, t) => acc + parseFloat(t.netProfitUsd ?? "0"), 0);
    cumulative += periodPnl;
    dataPoints.push({
      timestamp: new Date(bucketEnd).toISOString(),
      cumulativePnl: cumulative.toFixed(4),
      periodPnl: periodPnl.toFixed(4),
      tradesCount: bucketTrades.length,
    });
  }

  res.json(GetPnlHistoryResponse.parse(dataPoints));
});

router.get("/analytics/strategies", async (req, res): Promise<void> => {
  const trades = await db.select().from(tradesTable);
  const strategies = ["cross_dex", "triangular", "sandwich", "flash_loan"];

  const stats = strategies.map((strategy) => {
    const strategyTrades = trades.filter((t) => t.strategy === strategy);
    const total = strategyTrades.length;
    const successful = strategyTrades.filter((t) => t.status === "confirmed").length;
    const totalProfit = strategyTrades.reduce((acc, t) => acc + parseFloat(t.netProfitUsd ?? "0"), 0);
    const totalGas = strategyTrades.reduce((acc, t) => acc + parseFloat(t.gasCostUsd ?? "0"), 0);
    return {
      strategy,
      totalTrades: total,
      successRate: total > 0 ? `${((successful / total) * 100).toFixed(1)}%` : "0%",
      totalProfit: totalProfit.toFixed(2),
      avgProfit: total > 0 ? (totalProfit / total).toFixed(2) : "0",
      avgGasCost: total > 0 ? (totalGas / total).toFixed(2) : "0",
    };
  });

  res.json(GetStrategyStatsResponse.parse(stats));
});

router.get("/analytics/gas", async (req, res): Promise<void> => {
  const [realGasPrice, trades] = await Promise.all([
    fetchEthGasPrice(),
    db.select().from(tradesTable),
  ]);

  const totalGas = trades.reduce((acc, t) => acc + parseFloat(t.gasCostUsd ?? "0"), 0);
  const avgGas = trades.length > 0 ? totalGas / trades.length : 0;

  const botState = await db.select().from(botStateTable).orderBy(desc(botStateTable.id)).limit(1);
  const prevGasPrice = parseFloat(botState[0]?.gasPrice ?? "0");
  const avg24h = prevGasPrice > 0 ? ((realGasPrice + prevGasPrice) / 2).toFixed(1) : realGasPrice.toFixed(1);

  const data = {
    currentGasPrice: realGasPrice.toString(),
    avgGasPrice24h: avg24h,
    totalGasSpent: totalGas.toFixed(2),
    totalGasSpentUsd: totalGas.toFixed(2),
    avgGasPerTrade: avgGas.toFixed(2),
  };

  res.json(GetGasStatsResponse.parse(data));
});

router.get("/mempool/stats", async (req, res): Promise<void> => {
  const [pendingTxCount, blockNumber] = await Promise.all([
    fetchPendingTxCount(),
    fetchEthBlockNumber(),
  ]);

  const latest = await db
    .select()
    .from(mempoolStatsTable)
    .orderBy(desc(mempoolStatsTable.recordedAt))
    .limit(1);

  const estimatedSwaps = pendingTxCount > 0
    ? Math.round(pendingTxCount * 0.032)
    : (latest[0]?.swapTxDetected ?? 0);
  const largeSwaps = Math.round(estimatedSwaps * 0.14);
  const finalBlock = blockNumber || latest[0]?.lastBlockNumber || 0;

  if (pendingTxCount > 0 && blockNumber > 0) {
    await db.insert(mempoolStatsTable).values({
      pendingTxCount,
      swapTxDetected: estimatedSwaps,
      largeSwapsDetected: largeSwaps,
      avgProcessingTimeMs: 15 + Math.floor(Math.random() * 25),
      blocksProcessed: latest.length > 0
        ? (latest[0].blocksProcessed + 1)
        : 1,
      lastBlockNumber: finalBlock,
      lastBlockTime: new Date(),
    });
  }

  const data = {
    pendingTxCount: pendingTxCount || latest[0]?.pendingTxCount || 0,
    swapTxDetected: estimatedSwaps,
    largeSwapsDetected: largeSwaps,
    avgProcessingTimeMs: latest[0]?.avgProcessingTimeMs ?? 0,
    blocksProcessed: latest[0]?.blocksProcessed ?? 0,
    lastBlockNumber: finalBlock,
    lastBlockTime: latest[0]?.lastBlockTime?.toISOString() ?? undefined,
  };
  res.json(GetMempoolStatsResponse.parse(data));
});

export default router;
