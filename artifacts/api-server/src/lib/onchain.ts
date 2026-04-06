/**
 * On-chain reserve scanner — queries BSC AMM pools directly.
 *
 * Advantages over DexScreener API:
 *   • Real-time (same block, no API lag)
 *   • Exact profit via constant-product AMM math (no approximation)
 *   • Finds opportunities for 20+ tokens including mid-cap alts
 *   • Optimal loan-amount search maximises profit
 */

import { ethers } from "ethers";
import { PANCAKE_FACTORY_BSC, BISWAP_FACTORY_BSC, APESWAP_FACTORY_BSC } from "./abi.js";
import type { ArbitrageOpportunity } from "./prices.js";

// ── RPC ───────────────────────────────────────────────────────────────────────
// Multiple public BSC endpoints for resilience
const BSC_RPCS = [
  "https://bsc-dataseed1.binance.org",
  "https://bsc-dataseed2.binance.org",
  "https://bsc-dataseed3.binance.org",
];

function makeProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(BSC_RPCS[Math.floor(Math.random() * BSC_RPCS.length)], 56);
}

// ── Minimal ABIs ──────────────────────────────────────────────────────────────
const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
];
const PAIR_ABI = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
];

// ── DEX registry ─────────────────────────────────────────────────────────────
// feeBps: total swap fee in basis-points (100 bps = 1%)
const SAFE_DEX_FACTORIES: Record<string, { factory: string; feeBps: bigint; label: string }> = {
  biswap:   { factory: BISWAP_FACTORY_BSC,  feeBps: 20n,  label: "Biswap"   },
  apeswap:  { factory: APESWAP_FACTORY_BSC, feeBps: 20n,  label: "ApeSwap"  },
  babyswap: { factory: "0x86407bEa2078ea5f5EB5A52B2caA963bC1F889Da", feeBps: 30n, label: "BabySwap" },
};

// PancakeSwap V2: flash-loan source (0.25% fee taken as repayment cost)
const PANCAKE_FLASH_FEE_BPS = 25n;

// ── Token registry ────────────────────────────────────────────────────────────
// [symbol, address, decimals]
// Mix of blue-chip and mid-cap — mid-cap tokens tend to have larger spreads
// because fewer bots actively arbitrage them.
const BASE_TOKENS: [string, string, number][] = [
  // Blue-chip / high-liquidity
  ["WBNB",  "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", 18],
  ["BTCB",  "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", 18],
  ["ETH",   "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", 18],
  ["CAKE",  "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", 18],
  // Mid-cap (less bots → occasional real spreads)
  ["XVS",   "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63", 18],
  ["ALPACA","0x8F0528cE5eF7B51152A59745bEfDD91D97091d2F", 18],
  ["BSW",   "0x965F527D9159dCe6288a2219DB51fc6Eef120dD1", 18],
  ["BAKE",  "0xE02dF9e3e622DeBdD69fb838bB799E3F168902c5", 18],
  ["TRX",   "0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e5",  6],
  ["WIN",   "0xaeF0d72a118ce24feE3cD1d43d383897D05B4e99", 18],
  ["ADA",   "0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47", 18],
  ["DOT",   "0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402", 18],
  ["LINK",  "0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD", 18],
  ["LTC",   "0x4338665CBB7B2485A8855A139b75D5e34AB0DB94", 18],
  ["MATIC", "0xCC42724C6683B7E57334c4E856f4c9965ED682bD", 18],
  ["DOGE",  "0xbA2aE424d960c26247Dd6c32edC70B295c744C43",  8],
  ["SOL",   "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF", 18],
  ["MBOX",  "0x3203c9E46cA618C8C1cE5dC67e7e9D75f5da2377", 18],
  ["FIL",   "0x0D8Ce2A99Bb6e3B7Db580eD848240e4a0F9aE153", 18],
  ["SXP",   "0x47BEAd2563dCBf3bF2c9407fEa4dC236fAbA485A", 18],
  // Extra BSC-native tokens
  ["SFUND", "0x477bC8d23c634C154061869478bce96BE6045D12", 18],
  ["RACA",  "0x12BB890508c125661E03b09EC06E404bc9289040", 18],
  ["GALA",  "0x7dDEE176F665cD201F93eEDE625770E2fD911990", 18],
  ["SAND",  "0x67b725d7e342d7B611fa85e859Df9697D9378B2e", 18],
  ["CHESS", "0x20de22029ab63cf9A7Cf5fEB2b737Ca1eE4c82A5", 18],
  ["EPS",   "0xA7f552078dcC247C2684336020c03648500C6d9F", 18],
  ["BELT",  "0xE0e514c71282b6f4e823703a39374Cf58dc3eA4f", 18],
  ["MDX",   "0x9C65AB58d8d978DB963e63f2bfB7121627e3a739", 18],
  ["SHIB",  "0x2859e4544C4bB03966803b044A93563Bd2D0DD4D", 18],
];

// Quote tokens – the borrowed token in the flash loan (must be very liquid on PancakeSwap V2)
const QUOTE_TOKENS: [string, string, number][] = [
  ["USDT", "0x55d398326f99059fF775485246999027B3197955", 18],
  ["BUSD", "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", 18],
  ["WBNB", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", 18],
];

// Token USD price fallbacks (updated by the scan loop via CoinGecko)
let TOKEN_USD_PRICES: Record<string, number> = {
  WBNB: 600, BTCB: 65000, ETH: 3000, CAKE: 2, USDT: 1, BUSD: 1,
  XVS: 8, ALPACA: 0.3, BSW: 0.15, BAKE: 0.15, TRX: 0.12, WIN: 0.0001,
  ADA: 0.45, DOT: 7, LINK: 14, LTC: 80, MATIC: 0.8, DOGE: 0.15,
  SOL: 170, MBOX: 0.3, FIL: 5, SXP: 0.3,
  SFUND: 0.5, RACA: 0.00005, GALA: 0.02, SAND: 0.3,
  CHESS: 0.06, EPS: 0.03, BELT: 0.5, MDX: 0.07, SHIB: 0.000015,
};

export function updateTokenPrices(prices: Record<string, number>): void {
  TOKEN_USD_PRICES = { ...TOKEN_USD_PRICES, ...prices };
}

// ── AMM math ──────────────────────────────────────────────────────────────────

function getAmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps: bigint,
): bigint {
  if (reserveIn === 0n || reserveOut === 0n || amountIn === 0n) return 0n;
  const fee = 10000n - feeBps;
  const num = amountIn * fee * reserveOut;
  const den = reserveIn * 10000n + amountIn * fee;
  return num / den;
}

/**
 * Exact flash-swap profit (in tokenA units):
 *   1. Borrow loanAmount of tokenA from PancakeSwap V2 (0.25% fee)
 *   2. Swap tokenA → tokenB at buyDex  (sell high — reserveA_buy has HIGH tokenA price)
 *   3. Swap tokenB → tokenA at sellDex (buy low  — reserveA_sell has LOW tokenA price)
 *   4. Repay loanAmount + 0.25% flash fee
 *   Returns: tokenAGot − repay  (positive = profit, negative = loss)
 */
function flashProfit(
  loanAmount: bigint,
  reserveA_buy: bigint, reserveB_buy: bigint, buyFeeBps: bigint,
  reserveB_sell: bigint, reserveA_sell: bigint, sellFeeBps: bigint,
): bigint {
  if (loanAmount <= 0n) return 0n;
  const tokenBGot = getAmountOut(loanAmount, reserveA_buy, reserveB_buy, buyFeeBps);
  if (tokenBGot === 0n) return 0n;
  const tokenAGot = getAmountOut(tokenBGot, reserveB_sell, reserveA_sell, sellFeeBps);
  const repay = loanAmount + (loanAmount * PANCAKE_FLASH_FEE_BPS + 9999n) / 10000n;
  return tokenAGot - repay;
}

/**
 * Find the loan amount (in [step, maxLoan] range) that yields the highest profit.
 * Uses ternary search since the profit function is unimodal for V2 AMMs.
 */
function optimalLoan(
  reserveA_buy: bigint, reserveB_buy: bigint, buyFeeBps: bigint,
  reserveB_sell: bigint, reserveA_sell: bigint, sellFeeBps: bigint,
  maxLoan: bigint,
): { loanAmount: bigint; profit: bigint } {
  let lo = maxLoan / 100n;
  let hi = maxLoan;
  for (let i = 0; i < 30; i++) {
    if (hi - lo < 2n) break;
    const m1 = lo + (hi - lo) / 3n;
    const m2 = hi - (hi - lo) / 3n;
    const p1 = flashProfit(m1, reserveA_buy, reserveB_buy, buyFeeBps, reserveB_sell, reserveA_sell, sellFeeBps);
    const p2 = flashProfit(m2, reserveA_buy, reserveB_buy, buyFeeBps, reserveB_sell, reserveA_sell, sellFeeBps);
    if (p1 < p2) lo = m1; else hi = m2;
  }
  const best = (lo + hi) / 2n;
  const profit = flashProfit(best, reserveA_buy, reserveB_buy, buyFeeBps, reserveB_sell, reserveA_sell, sellFeeBps);
  return { loanAmount: best, profit };
}

// ── Reserve fetching ──────────────────────────────────────────────────────────

interface Reserves {
  dexKey: string;
  label: string;
  feeBps: bigint;
  reserveA: bigint; // tokenA reserve
  reserveB: bigint; // tokenB reserve
}

async function fetchReserves(
  provider: ethers.JsonRpcProvider,
  factoryAddr: string,
  tokenA: string,
  tokenB: string,
  dexKey: string,
  label: string,
  feeBps: bigint,
): Promise<Reserves | null> {
  try {
    const factory = new ethers.Contract(factoryAddr, FACTORY_ABI, provider);
    const pairAddr: string = await factory.getPair(tokenA, tokenB);
    if (!pairAddr || pairAddr === ethers.ZeroAddress) return null;

    const pair = new ethers.Contract(pairAddr, PAIR_ABI, provider);
    const [r0, r1] = await pair.getReserves();
    const token0: string = await pair.token0();

    const isTokenAFirst = token0.toLowerCase() === tokenA.toLowerCase();
    const reserveA = isTokenAFirst ? r0 : r1;
    const reserveB = isTokenAFirst ? r1 : r0;

    if (reserveA === 0n || reserveB === 0n) return null;
    return { dexKey, label, feeBps, reserveA, reserveB };
  } catch {
    return null;
  }
}

// ── Main scanner ──────────────────────────────────────────────────────────────

const MIN_RESERVE_USD = 3_000;   // skip pairs with <$3k liquidity (catches smaller pools)
const MIN_NET_PROFIT_USD = 0.10; // show opportunities with >$0.10 net profit
const GAS_COST_USD_FLASH = 0.012; // ~$0.012 gas at 3 gwei, flash loan tx

export async function scanOnChainOpportunities(
  bnbPriceUsd: number = 600,
  gasCostUsd: number = GAS_COST_USD_FLASH,
): Promise<ArbitrageOpportunity[]> {
  const provider = makeProvider();
  const opportunities: ArbitrageOpportunity[] = [];

  // Build scan pairs: avoid quote==base
  const scanPairs: [string, string, number, string, string, number][] = [];
  for (const [bSym, bAddr, bDec] of BASE_TOKENS) {
    for (const [qSym, qAddr, qDec] of QUOTE_TOKENS) {
      if (bAddr.toLowerCase() === qAddr.toLowerCase()) continue;
      scanPairs.push([bSym, bAddr, bDec, qSym, qAddr, qDec]);
    }
  }

  // Process all pairs in parallel (batched to avoid RPC overload)
  const BATCH = 8;
  for (let i = 0; i < scanPairs.length; i += BATCH) {
    const batch = scanPairs.slice(i, i + BATCH);
    await Promise.all(batch.map(async ([bSym, bAddr, bDec, qSym, qAddr]) => {
      // Fetch reserves from all safe DEXes in parallel
      const reserveResults = await Promise.all(
        Object.entries(SAFE_DEX_FACTORIES).map(([key, { factory, feeBps, label }]) =>
          fetchReserves(provider, factory, bAddr, qAddr, key, label, feeBps)
        )
      );

      const reserves = reserveResults.filter((r): r is Reserves => r !== null);
      if (reserves.length < 2) return; // need at least 2 DEXes

      // Filter by minimum USD liquidity
      const bPriceUsd = TOKEN_USD_PRICES[bSym] ?? 0;
      const validReserves = reserves.filter((r) => {
        const reserveAUsd = Number(ethers.formatUnits(r.reserveA, bDec)) * bPriceUsd;
        return reserveAUsd >= MIN_RESERVE_USD;
      });
      if (validReserves.length < 2) return;

      // Try all DEX pairs as (buyDex, sellDex)
      for (let a = 0; a < validReserves.length; a++) {
        for (let b = 0; b < validReserves.length; b++) {
          if (a === b) continue;
          const buy = validReserves[a]!;
          const sell = validReserves[b]!;

          // buyDex: tokenA price is HIGH → we get lots of tokenB when swapping
          // sellDex: tokenA price is LOW  → we spend little tokenB to get tokenA back
          // Price of tokenA at a DEX: reserveB / reserveA
          const priceAt_buy  = Number(buy.reserveB)  / Number(buy.reserveA);
          const priceAt_sell = Number(sell.reserveB) / Number(sell.reserveA);
          if (priceAt_buy <= priceAt_sell) continue; // no spread in this direction

          const spreadPct = ((priceAt_buy - priceAt_sell) / priceAt_sell) * 100;
          if (spreadPct < 0.3 || spreadPct > 15) continue; // filter noise and outliers

          // Max loan = 5% of the smaller pool's tokenA reserve (limit price impact)
          const minReserveA = buy.reserveA < sell.reserveA ? buy.reserveA : sell.reserveA;
          const maxLoan = minReserveA / 20n;
          if (maxLoan === 0n) continue;

          const { loanAmount, profit } = optimalLoan(
            buy.reserveA,  buy.reserveB,  buy.feeBps,
            sell.reserveB, sell.reserveA, sell.feeBps,
            maxLoan,
          );

          if (profit <= 0n) continue;

          // Convert profit to USD
          const profitTokenA = Number(ethers.formatUnits(profit, bDec));
          const profitUsd = profitTokenA * bPriceUsd;
          const netProfitUsd = profitUsd - gasCostUsd;

          if (netProfitUsd < MIN_NET_PROFIT_USD) continue;

          const loanAmountNum = Number(ethers.formatUnits(loanAmount, bDec));
          const loanAmountUsd = loanAmountNum * bPriceUsd;

          // Price at buyDex (in USD per tokenA)
          const buyPriceUsd  = priceAt_buy  * (TOKEN_USD_PRICES[qSym] ?? 1);
          const sellPriceUsd = priceAt_sell * (TOKEN_USD_PRICES[qSym] ?? 1);

          opportunities.push({
            tokenPair: `${bSym}/${qSym}`,
            buyDex:  buy.label,
            sellDex: sell.label,
            buyPrice:  buyPriceUsd,
            sellPrice: sellPriceUsd,
            profitPercent: spreadPct,
            profitUsd,
            gasEstimateUsd: gasCostUsd,
            netProfitUsd,
            strategy: "flash_loan",
            amountIn: loanAmountUsd,
            detectedAt: new Date(),
          });
        }
      }
    }));
  }

  return opportunities.sort((a, b) => b.netProfitUsd - a.netProfitUsd);
}
