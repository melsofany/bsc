# MEV Alpha Bot - Workspace

## Overview

A professional MEV (Maximal Extractable Value) and Arbitrage Bot trading dashboard built as a full-stack application. Designed for crypto arbitrage traders who monitor their automated MEV bots 24/7.

## First-Time Setup (After Remix)

When you remix this project, the database starts empty. Run these steps once:

```bash
# 1. Provision the database (from Replit Database tab or via scripts)
# 2. Push schema to create all tables
pnpm --filter @workspace/db run push-force

# 3. Seed initial clean data (default config + bot state)
pnpm --filter @workspace/scripts run seed
```

These steps also run automatically via the post-merge script at `scripts/post-merge.sh`.

**No fake or dummy data is seeded** — the dashboard starts empty and only populates with real data once you start the bot.

## Getting Started

1. **Provision a database** — Use the Replit Database tab to create a PostgreSQL database. `DATABASE_URL` is set automatically.
2. **Run setup** — `pnpm --filter @workspace/db run push-force && pnpm --filter @workspace/scripts run seed`
3. **Configure your wallet** — Go to Settings tab in the dashboard, enter your BSC wallet private key and your deployed `FlashLoanArbitrage` contract address.
4. **Choose mode**:
   - `simulation` — safe mode, no real funds used, tests strategies with realistic outcomes
   - `live` — real on-chain execution on BSC; requires wallet with BNB for gas
5. **Start the bot** — Click Start in the dashboard. The bot will scan for arbitrage opportunities and execute trades automatically.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS
- **Charts**: Recharts
- **Routing**: Wouter

## Architecture

### Frontend (artifacts/mev-dashboard)
- **Dashboard**: Bot status, PnL counter, key metrics, live opportunity radar, cumulative PnL chart
- **Opportunities**: Full log of all detected arbitrage opportunities with filtering
- **Trades**: Execution history with tx hashes, profit/loss, gas costs
- **Analytics**: Strategy performance charts, PnL history, gas stats, trade distribution
- **Mempool**: Live mempool monitoring statistics
- **Settings**: Bot configuration + Wallet/Contract connection panel for live execution

### Backend (artifacts/api-server)
- `/api/bot/status` - Bot status with uptime, wallet balance, gas price
- `/api/bot/start` - Start bot
- `/api/bot/stop` - Stop bot
- `/api/opportunities` - List arbitrage opportunities (filterable by strategy/status)
- `/api/opportunities/live` - Live opportunities feed
- `/api/trades` - Trade history
- `/api/trades/:id` - Individual trade details
- `/api/analytics/summary` - PnL, success rate, volume stats
- `/api/analytics/pnl` - PnL history data points
- `/api/analytics/strategies` - Performance by strategy type
- `/api/analytics/gas` - Gas usage statistics
- `/api/mempool/stats` - Mempool monitoring stats
- `/api/config` - Bot configuration CRUD
- `/api/wallet/status` - Connected wallet info (address, balance, contract status)
- `/api/wallet/connect` - Connect hot wallet via private key + contract address
- `/api/wallet/disconnect` - Disconnect wallet
- `/api/execute/:opportunityId` - Execute a specific opportunity (live or simulated)

### Auto-Trader (artifacts/api-server/src/lib/autoTrader.ts)
- Runs as a background loop while the server is up
- Only scans and executes when `bot_state.running = true`
- Scans for live opportunities from DexScreener every 30 seconds
- Executes detected opportunities every 15 seconds
- Respects simulation vs live mode from `bot_config.mode` + `bot_state.mode`

### Smart Contract (contracts/)
- `FlashLoanArbitrage.sol` - PancakeSwap V2 Flash Swap arbitrage contract (`PancakeFlashArbitrage`)
  - BSC-native: uses PancakeSwap V2 pair flash swaps — no Aave dependency (Aave is NOT on BSC)
  - Constructor: `constructor(address pancakeFactory)` — pass `0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73`
  - Executes: flash-swap from pair → buy on DEX A → sell on DEX B → repay pair + 0.25% fee → keep profit
  - All in one atomic transaction — reverts if profit insufficient
  - Callback: `pancakeCall(sender, amount0, amount1, data)` — standard PancakeSwap V2 flash swap interface
- `src/lib/abi.ts` - Contract ABI, PancakeSwap factory ABI, DEX router addresses, token addresses by network

### Execution Engine (artifacts/api-server/src/lib/executor.ts)
- Wallet connection and balance fetching via ethers.js
- Smart contract validation (checks bytecode + reads owner)
- Simulation mode: uses real DEX prices and gas costs, no on-chain tx
- Live mode (BSC only): looks up PancakeSwap V2 pair via factory, then calls `executeArbitrage()` on the deployed `PancakeFlashArbitrage` contract
- Flash swap source: PancakeSwap V2 pair (tokenBorrow/tokenOut) — 0.25% fee
- BSC fallback RPC list for reliability

### Database Tables (lib/db)
- `bot_config` - Bot configuration settings + `contractAddress`
- `bot_state` - Current bot status + `walletPrivateKey` (server-side only)
- `opportunities` - All detected arbitrage opportunities
- `trades` - All executed trades (real or simulated)
- `mempool_stats` - Mempool monitoring snapshots

## MEV Strategies Supported
1. **Cross-DEX Arbitrage** - Buy on one DEX, sell on another in same block
2. **Flash Loan Arbitrage** - Borrow large sums, arbitrage, repay in one transaction
3. **Triangular Arbitrage** - 3-token cycle within one DEX

## Networks
- BSC (Binance Smart Chain) — default
- Ethereum Mainnet (with Flashbots support)
- Polygon
- Arbitrum

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/db run push-force` — push DB schema (creates tables)
- `pnpm --filter @workspace/scripts run seed` — seed initial data (idempotent, safe to re-run)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Security Notes

- The bot runs in **Simulation mode** by default — no real funds at risk
- Switch to **Live mode** only after wallet and contract are properly configured
- Private keys are stored in `bot_state.wallet_private_key` in the database — treat the database as sensitive
- Flashbots integration prevents front-running by competitors on Ethereum
- Minimum ~0.05 BNB recommended in wallet to cover gas for live BSC trading

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
