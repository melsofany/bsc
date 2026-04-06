import {
  pgTable,
  text,
  serial,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botConfigTable = pgTable("bot_config", {
  id: serial("id").primaryKey(),
  network: text("network").notNull().default("bsc"),
  mode: text("mode").notNull().default("simulation"),
  contractAddress: text("contract_address"),
  minProfitThresholdUsd: numeric("min_profit_threshold_usd", {
    precision: 10,
    scale: 2,
  })
    .notNull()
    .default("1.00"),
  maxGasPriceGwei: numeric("max_gas_price_gwei", { precision: 10, scale: 2 })
    .notNull()
    .default("5"),
  slippageTolerance: numeric("slippage_tolerance", { precision: 5, scale: 2 })
    .notNull()
    .default("0.5"),
  flashbotsEnabled: boolean("flashbots_enabled").notNull().default(false),
  flashLoanEnabled: boolean("flash_loan_enabled").notNull().default(true),
  flashLoanProvider: text("flash_loan_provider").notNull().default("pancakeswap"),
  strategies: text("strategies").array().notNull().default(["cross_dex", "triangular"]),
  dexList: text("dex_list")
    .array()
    .notNull()
    .default(["pancakeswap_v2", "pancakeswap_v3", "biswap", "apeswap"]),
  tokenWatchlist: text("token_watchlist")
    .array()
    .notNull()
    .default(["WBNB/USDT", "WBNB/BUSD", "USDT/BUSD", "ETH/WBNB", "CAKE/WBNB"]),
  maxPositionSizeUsd: numeric("max_position_size_usd", {
    precision: 15,
    scale: 2,
  })
    .notNull()
    .default("10000"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const opportunitiesTable = pgTable("opportunities", {
  id: serial("id").primaryKey(),
  strategy: text("strategy").notNull(),
  tokenPair: text("token_pair").notNull(),
  buyDex: text("buy_dex"),
  sellDex: text("sell_dex"),
  buyPrice: numeric("buy_price", { precision: 30, scale: 18 }),
  sellPrice: numeric("sell_price", { precision: 30, scale: 18 }),
  profitEstimate: numeric("profit_estimate", { precision: 15, scale: 4 }),
  profitPercent: numeric("profit_percent", { precision: 8, scale: 4 }),
  gasEstimate: numeric("gas_estimate", { precision: 15, scale: 4 }),
  netProfit: numeric("net_profit", { precision: 15, scale: 4 }),
  status: text("status").notNull().default("detected"),
  detectedAt: timestamp("detected_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  txHash: text("tx_hash"),
  amountIn: text("amount_in"),
  flashLoanUsed: boolean("flash_loan_used").notNull().default(false),
  slippage: numeric("slippage", { precision: 6, scale: 4 }),
});

export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  opportunityId: integer("opportunity_id").references(() => opportunitiesTable.id),
  txHash: text("tx_hash"),
  strategy: text("strategy").notNull(),
  tokenPair: text("token_pair").notNull(),
  amountIn: text("amount_in"),
  amountOut: text("amount_out"),
  profit: text("profit"),
  profitUsd: numeric("profit_usd", { precision: 15, scale: 4 }),
  gasUsed: text("gas_used"),
  gasCost: text("gas_cost"),
  gasCostUsd: numeric("gas_cost_usd", { precision: 15, scale: 4 }),
  netProfitUsd: numeric("net_profit_usd", { precision: 15, scale: 4 }),
  status: text("status").notNull().default("pending"),
  blockNumber: integer("block_number"),
  executedAt: timestamp("executed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  flashLoanAmount: text("flash_loan_amount"),
  flashLoanFee: text("flash_loan_fee"),
  buyDex: text("buy_dex"),
  sellDex: text("sell_dex"),
  buyPrice: numeric("buy_price", { precision: 20, scale: 10 }),
  sellPrice: numeric("sell_price", { precision: 20, scale: 10 }),
  slippage: numeric("slippage", { precision: 8, scale: 4 }),
  flashLoanFeeUsd: numeric("flash_loan_fee_usd", { precision: 15, scale: 4 }),
  bnbPriceUsd: numeric("bnb_price_usd", { precision: 12, scale: 4 }),
  error: text("error"),
});

export const botStateTable = pgTable("bot_state", {
  id: serial("id").primaryKey(),
  running: boolean("running").notNull().default(false),
  startedAt: timestamp("started_at", { withTimezone: true }),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  network: text("network").notNull().default("bsc"),
  walletAddress: text("wallet_address"),
  walletBalance: text("wallet_balance").default("0"),
  walletPrivateKey: text("wallet_private_key"),
  pendingTxCount: integer("pending_tx_count").notNull().default(0),
  blockNumber: integer("block_number").notNull().default(0),
  gasPrice: text("gas_price").default("0"),
  mode: text("mode").notNull().default("simulation"),
  connectedToNode: boolean("connected_to_node").notNull().default(false),
  flashbotsEnabled: boolean("flashbots_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const mempoolStatsTable = pgTable("mempool_stats", {
  id: serial("id").primaryKey(),
  pendingTxCount: integer("pending_tx_count").notNull().default(0),
  swapTxDetected: integer("swap_tx_detected").notNull().default(0),
  largeSwapsDetected: integer("large_swaps_detected").notNull().default(0),
  avgProcessingTimeMs: integer("avg_processing_time_ms").notNull().default(0),
  blocksProcessed: integer("blocks_processed").notNull().default(0),
  lastBlockNumber: integer("last_block_number").notNull().default(0),
  lastBlockTime: timestamp("last_block_time", { withTimezone: true }),
  recordedAt: timestamp("recorded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertBotConfigSchema = createInsertSchema(botConfigTable).omit({
  id: true,
  updatedAt: true,
});
export const insertOpportunitySchema = createInsertSchema(
  opportunitiesTable
).omit({ id: true });
export const insertTradeSchema = createInsertSchema(tradesTable).omit({
  id: true,
});
export const insertBotStateSchema = createInsertSchema(botStateTable).omit({
  id: true,
  updatedAt: true,
});

export type BotConfig = typeof botConfigTable.$inferSelect;
export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;
export type Opportunity = typeof opportunitiesTable.$inferSelect;
export type InsertOpportunity = z.infer<typeof insertOpportunitySchema>;
export type Trade = typeof tradesTable.$inferSelect;
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type BotState = typeof botStateTable.$inferSelect;
export type MempoolStats = typeof mempoolStatsTable.$inferSelect;
