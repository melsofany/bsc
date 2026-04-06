import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { botConfigTable, botStateTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  GetConfigResponse,
  UpdateConfigBody,
  UpdateConfigResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getOrCreateConfig() {
  const existing = await db
    .select()
    .from(botConfigTable)
    .orderBy(desc(botConfigTable.id))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const [created] = await db
    .insert(botConfigTable)
    .values({
      network: "bsc",
      mode: "simulation",
      minProfitThresholdUsd: "1.00",
      maxGasPriceGwei: "5",
      slippageTolerance: "0.5",
      flashbotsEnabled: false,
      flashLoanEnabled: true,
      flashLoanProvider: "pancakeswap",
      strategies: ["cross_dex", "triangular"],
      dexList: ["pancakeswap_v2", "pancakeswap_v3", "biswap", "apeswap"],
      tokenWatchlist: ["WBNB/USDT", "WBNB/BUSD", "USDT/BUSD", "ETH/WBNB", "CAKE/WBNB"],
      maxPositionSizeUsd: "10000",
    })
    .returning();
  return created;
}

function mapConfig(c: typeof botConfigTable.$inferSelect) {
  return {
    id: c.id,
    network: c.network,
    mode: c.mode,
    contractAddress: c.contractAddress ?? undefined,
    minProfitThresholdUsd: c.minProfitThresholdUsd,
    maxGasPriceGwei: c.maxGasPriceGwei,
    slippageTolerance: c.slippageTolerance,
    flashbotsEnabled: c.flashbotsEnabled,
    flashLoanEnabled: c.flashLoanEnabled,
    flashLoanProvider: c.flashLoanProvider,
    strategies: c.strategies,
    dexList: c.dexList,
    tokenWatchlist: c.tokenWatchlist,
    maxPositionSizeUsd: c.maxPositionSizeUsd,
    updatedAt: c.updatedAt.toISOString(),
  };
}

router.get("/config", async (req, res): Promise<void> => {
  const config = await getOrCreateConfig();
  res.json(GetConfigResponse.parse(mapConfig(config)));
});

router.put("/config", async (req, res): Promise<void> => {
  const parsed = UpdateConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const config = await getOrCreateConfig();
  const updateData: Partial<typeof botConfigTable.$inferInsert> = {};

  const d = parsed.data;
  if (d.network !== undefined) updateData.network = d.network;
  if (d.mode !== undefined) updateData.mode = d.mode;
  if ((d as any).contractAddress !== undefined) updateData.contractAddress = (d as any).contractAddress;
  if (d.minProfitThresholdUsd !== undefined) updateData.minProfitThresholdUsd = d.minProfitThresholdUsd;
  if (d.maxGasPriceGwei !== undefined) updateData.maxGasPriceGwei = d.maxGasPriceGwei;
  if (d.slippageTolerance !== undefined) updateData.slippageTolerance = d.slippageTolerance;
  if (d.flashbotsEnabled !== undefined) updateData.flashbotsEnabled = d.flashbotsEnabled;
  if (d.flashLoanEnabled !== undefined) updateData.flashLoanEnabled = d.flashLoanEnabled;
  if (d.flashLoanProvider !== undefined) updateData.flashLoanProvider = d.flashLoanProvider;
  if (d.strategies !== undefined) updateData.strategies = d.strategies;
  if (d.dexList !== undefined) updateData.dexList = d.dexList;
  if (d.tokenWatchlist !== undefined) updateData.tokenWatchlist = d.tokenWatchlist;
  if (d.maxPositionSizeUsd !== undefined) updateData.maxPositionSizeUsd = d.maxPositionSizeUsd;

  const [updated] = await db
    .update(botConfigTable)
    .set(updateData)
    .where(eq(botConfigTable.id, config.id))
    .returning();

  // Sync mode and network to bot_state so the status bar reflects changes immediately
  const botStateSync: Record<string, any> = {};
  if (updateData.mode !== undefined) botStateSync.mode = updateData.mode;
  if (updateData.network !== undefined) botStateSync.network = updateData.network;
  if (Object.keys(botStateSync).length > 0) {
    const existing = await db.select().from(botStateTable).orderBy(desc(botStateTable.id)).limit(1);
    if (existing.length > 0) {
      await db.update(botStateTable).set(botStateSync).where(eq(botStateTable.id, existing[0].id));
    }
  }

  res.json(UpdateConfigResponse.parse(mapConfig(updated)));
});

export default router;
