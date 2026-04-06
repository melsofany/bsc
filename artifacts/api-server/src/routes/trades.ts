import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tradesTable } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import {
  ListTradesQueryParams,
  ListTradesResponse,
  GetTradeParams,
  GetTradeResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function mapTrade(r: typeof tradesTable.$inferSelect) {
  return {
    ...r,
    profitUsd: r.profitUsd ?? undefined,
    gasCostUsd: r.gasCostUsd ?? undefined,
    netProfitUsd: r.netProfitUsd ?? undefined,
    executedAt: r.executedAt.toISOString(),
    confirmedAt: r.confirmedAt?.toISOString() ?? undefined,
    txHash: r.txHash ?? undefined,
    amountIn: r.amountIn ?? undefined,
    amountOut: r.amountOut ?? undefined,
    profit: r.profit ?? undefined,
    gasUsed: r.gasUsed ?? undefined,
    gasCost: r.gasCost ?? undefined,
    blockNumber: r.blockNumber ?? undefined,
    flashLoanAmount: r.flashLoanAmount ?? undefined,
    flashLoanFee: r.flashLoanFee ?? undefined,
    buyDex: r.buyDex ?? undefined,
    sellDex: r.sellDex ?? undefined,
    error: r.error ?? undefined,
    opportunityId: r.opportunityId ?? undefined,
  };
}

router.get("/trades", async (req, res): Promise<void> => {
  const parsed = ListTradesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { limit = 50, status } = parsed.data;
  const conditions = [];
  if (status) conditions.push(eq(tradesTable.status, status));

  const rows = await db
    .select()
    .from(tradesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(tradesTable.executedAt))
    .limit(limit ?? 50);

  res.json(ListTradesResponse.parse(rows.map(mapTrade)));
});

router.get("/trades/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid trade id" });
    return;
  }

  const [row] = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.id, id))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  res.json(GetTradeResponse.parse(mapTrade(row)));
});

export default router;
