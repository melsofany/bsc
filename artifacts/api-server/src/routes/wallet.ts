import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { botStateTable, botConfigTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { connectWallet, getWalletBalance, validateContractDeployment } from "../lib/executor.js";

const router: IRouter = Router();

async function getState() {
  const rows = await db.select().from(botStateTable).orderBy(desc(botStateTable.id)).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db
    .insert(botStateTable)
    .values({ running: false, network: "bsc", mode: "simulation", connectedToNode: true, flashbotsEnabled: false })
    .returning();
  return created;
}

async function getConfig() {
  const rows = await db.select().from(botConfigTable).orderBy(desc(botConfigTable.id)).limit(1);
  return rows[0] ?? null;
}

router.get("/wallet/status", async (req, res): Promise<void> => {
  const state = await getState();
  const config = await getConfig();

  if (!state.walletPrivateKey || !state.walletAddress) {
    res.json({ connected: false });
    return;
  }

  const balance = await getWalletBalance(state.walletAddress, state.network);

  const contractAddress = config?.contractAddress ?? undefined;
  let contractValid = false;
  let contractOwner: string | undefined;
  let contractError: string | undefined;

  if (contractAddress) {
    const validation = await validateContractDeployment(contractAddress, state.network);
    contractValid = validation.valid;
    contractOwner = validation.owner;
    contractError = validation.error;
  }

  res.json({
    connected: true,
    address: state.walletAddress,
    balance,
    network: state.network,
    contractAddress: contractAddress ?? undefined,
    contractValid,
    contractOwner,
    contractError,
  });
});

router.post("/wallet/connect", async (req, res): Promise<void> => {
  const { privateKey, contractAddress, network: reqNetwork } = req.body as {
    privateKey?: string;
    contractAddress?: string;
    network?: string;
  };

  if (!privateKey || typeof privateKey !== "string" || privateKey.trim().length < 32) {
    res.status(400).json({ error: "Valid private key required (minimum 32 hex chars)" });
    return;
  }

  const state = await getState();
  const network = reqNetwork ?? state.network ?? "bsc";

  let walletInfo: { address: string; balance: string; network: string };
  try {
    walletInfo = await connectWallet(privateKey.trim(), network);
  } catch (err: any) {
    res.status(400).json({ error: `Invalid private key: ${err?.message ?? "unknown error"}` });
    return;
  }

  await db
    .update(botStateTable)
    .set({
      walletAddress: walletInfo.address,
      walletBalance: walletInfo.balance,
      walletPrivateKey: privateKey.trim(),
      network,
    })
    .where(eq(botStateTable.id, state.id));

  if (contractAddress && typeof contractAddress === "string" && contractAddress.startsWith("0x")) {
    const config = await getConfig();
    if (config) {
      await db
        .update(botConfigTable)
        .set({ contractAddress })
        .where(eq(botConfigTable.id, config.id));
    }
  }

  let contractValid = false;
  let contractOwner: string | undefined;
  const finalContractAddress = contractAddress ?? (await getConfig())?.contractAddress ?? undefined;

  if (finalContractAddress) {
    const validation = await validateContractDeployment(finalContractAddress, network);
    contractValid = validation.valid;
    contractOwner = validation.owner;
  }

  res.json({
    connected: true,
    address: walletInfo.address,
    balance: walletInfo.balance,
    network,
    contractAddress: finalContractAddress,
    contractValid,
    contractOwner,
  });
});

router.post("/wallet/disconnect", async (req, res): Promise<void> => {
  const state = await getState();
  await db
    .update(botStateTable)
    .set({ walletAddress: null, walletBalance: "0", walletPrivateKey: null })
    .where(eq(botStateTable.id, state.id));

  res.json({ connected: false });
});

export default router;
