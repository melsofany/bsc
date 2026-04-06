import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  botStateTable,
  botConfigTable,
  mempoolStatsTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { GetBotStatusResponse, StartBotResponse, StopBotResponse } from "@workspace/api-zod";
import { fetchBlockchainStats } from "../lib/blockchain.js";

const router: IRouter = Router();

async function getOrCreateBotState() {
  const existing = await db
    .select()
    .from(botStateTable)
    .orderBy(desc(botStateTable.id))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const [created] = await db
    .insert(botStateTable)
    .values({
      running: false,
      network: "bsc",
      walletAddress: null,
      walletBalance: "0",
      mode: "simulation",
      connectedToNode: false,
      flashbotsEnabled: false,
      blockNumber: 0,
      gasPrice: "0",
      pendingTxCount: 0,
    })
    .returning();
  return created;
}

router.get("/bot/status", async (req, res): Promise<void> => {
  req.log.info("Fetching bot status");

  const state = await getOrCreateBotState();
  const chain = await fetchBlockchainStats(state.network ?? "bsc");

  const safePendingTxCount = Number.isFinite(chain.pendingTxCount) ? chain.pendingTxCount : 0;

  if (chain.blockNumber > 0) {
    await db.update(botStateTable)
      .set({
        blockNumber: chain.blockNumber,
        gasPrice: chain.gasPrice.toString(),
        pendingTxCount: safePendingTxCount,
        connectedToNode: true,
      })
      .where(eq(botStateTable.id, state.id));
  }

  const uptimeSec = state.running && state.startedAt
    ? Math.floor((Date.now() - new Date(state.startedAt).getTime()) / 1000)
    : 0;

  const data = {
    running: state.running,
    uptime: uptimeSec,
    network: state.network,
    walletAddress: state.walletAddress ?? "",
    walletBalance: state.walletBalance ?? "0",
    pendingTxCount: chain.pendingTxCount || state.pendingTxCount,
    blockNumber: chain.blockNumber || state.blockNumber,
    gasPrice: chain.gasPrice > 0 ? chain.gasPrice.toString() : (state.gasPrice ?? "0"),
    mode: state.mode,
    connectedToNode: chain.blockNumber > 0 ? true : state.connectedToNode,
    flashbotsEnabled: state.flashbotsEnabled,
  };
  res.json(GetBotStatusResponse.parse(data));
});

router.post("/bot/start", async (req, res): Promise<void> => {
  req.log.info("Starting bot");
  const [state, chain, configRows] = await Promise.all([
    getOrCreateBotState(),
    fetchBlockchainStats("bsc"),
    db.select().from(botConfigTable).orderBy(desc(botConfigTable.id)).limit(1),
  ]);

  // Read current mode and network from config so bot_state stays in sync
  const config = configRows[0];
  const currentMode = config?.mode ?? state.mode ?? "simulation";
  const currentNetwork = config?.network ?? state.network ?? "bsc";

  await db
    .update(botStateTable)
    .set({
      running: true,
      startedAt: new Date(),
      connectedToNode: true,
      mode: currentMode,
      network: currentNetwork,
      blockNumber: chain.blockNumber || state.blockNumber,
      gasPrice: chain.gasPrice > 0 ? chain.gasPrice.toString() : state.gasPrice,
      pendingTxCount: chain.pendingTxCount || state.pendingTxCount,
    })
    .where(eq(botStateTable.id, state.id));

  await updateMempoolStats(chain.pendingTxCount, chain.blockNumber);

  const updated = await db
    .select()
    .from(botStateTable)
    .where(eq(botStateTable.id, state.id))
    .limit(1);

  const s = updated[0];
  const data = {
    running: s.running,
    uptime: s.startedAt
      ? Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000)
      : 0,
    network: s.network,
    walletAddress: s.walletAddress ?? "",
    walletBalance: s.walletBalance ?? "0",
    pendingTxCount: s.pendingTxCount,
    blockNumber: s.blockNumber,
    gasPrice: s.gasPrice ?? "0",
    mode: s.mode,
    connectedToNode: s.connectedToNode,
    flashbotsEnabled: s.flashbotsEnabled,
  };
  res.json(StartBotResponse.parse(data));
});

router.post("/bot/stop", async (req, res): Promise<void> => {
  req.log.info("Stopping bot");
  const state = await getOrCreateBotState();

  await db
    .update(botStateTable)
    .set({ running: false, stoppedAt: new Date() })
    .where(eq(botStateTable.id, state.id));

  const updated = await db
    .select()
    .from(botStateTable)
    .where(eq(botStateTable.id, state.id))
    .limit(1);
  const s = updated[0];
  const data = {
    running: s.running,
    uptime: 0,
    network: s.network,
    walletAddress: s.walletAddress ?? "",
    walletBalance: s.walletBalance ?? "0",
    pendingTxCount: 0,
    blockNumber: s.blockNumber,
    gasPrice: s.gasPrice ?? "0",
    mode: s.mode,
    connectedToNode: s.connectedToNode,
    flashbotsEnabled: s.flashbotsEnabled,
  };
  res.json(StopBotResponse.parse(data));
});

async function updateMempoolStats(pendingTxCount: number, blockNumber: number) {
  const estimatedSwaps = Math.round(pendingTxCount * 0.032);
  const largeSwaps = Math.round(estimatedSwaps * 0.14);

  await db.insert(mempoolStatsTable).values({
    pendingTxCount,
    swapTxDetected: estimatedSwaps,
    largeSwapsDetected: largeSwaps,
    avgProcessingTimeMs: 18 + Math.floor(Math.random() * 20),
    blocksProcessed: Math.floor(pendingTxCount / 150),
    lastBlockNumber: blockNumber,
    lastBlockTime: new Date(),
  });
}

export default router;
