export interface DexPairPrice {
  dex: string;
  pair: string;
  tokenSymbol: string;
  priceNormalized: number;
  liquidity: number;
  volume24h: number;
  pairAddress: string;
}

export interface ArbitrageOpportunity {
  tokenPair: string;
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  profitPercent: number;
  profitUsd: number;
  gasEstimateUsd: number;
  netProfitUsd: number;
  strategy: "cross_dex" | "triangular" | "flash_loan";
  amountIn: number;
  detectedAt: Date;
}

const DEX_NAME_MAP: Record<string, string> = {
  pancakeswap:              "PancakeSwap V2",
  "pancakeswap-v3":         "PancakeSwap V3",
  pancakeswap_v3:           "PancakeSwap V3",
  "pancakeswap-stableswap": "PancakeSwap SS",
  biswap:                   "Biswap",
  apeswap:                  "ApeSwap",
  babyswap:                 "BabySwap",
  sushiswap:                "SushiSwap",
  uniswap:                  "Uniswap V3",
  uniswap_v3:               "Uniswap V3",
  "uniswap-v3":             "Uniswap V3",
  mdex:                     "MDEX",
  dodo:                     "DODO",
  ellipsis:                 "Ellipsis",
  "1inch":                  "1inch",
  thena:                    "Thena",
  "thena-v3":               "Thena V3",
  knightswap:               "KnightSwap",
  waultswap:                "WaultSwap",
  nomiswap:                 "NomiSwap",
  nomiswap_stable:          "NomiSwap S",
  orionprotocol:            "Orion",
  acryptos:                 "ACryptoS",
  squadswap:                "SquadSwap",
  "squadswap-v3":           "SquadSwap V3",
};

// Keys in DEX_ROUTERS["bsc"] with compatible V2/V3 ABI and confirmed BSC liquidity.
// Thena/Solidly: custom router interface (incompatible) — excluded.
// uniswap_v3: Uniswap officially doesn't support BSC; router 0xB971... has no reliable pools.
// sushiswap / knightswap / waultswap / nomiswap / mdex: tiny or inactive — high failure rate.
// pancakeswap_ss (StableSwap): custom curve interface, not standard V2/V3.
const KNOWN_BSC_EXECUTOR_KEYS = new Set([
  "pancakeswap_v2",  // flash loan source only (buy/sell legs are promoted away from V2)
  "pancakeswap_v3",  // pure SwapRouter — V3 concentrated-liquidity pools
  "biswap",          // high BSC liquidity, independent V2 pair contracts
  "apeswap",         // active BSC DEX, independent V2 pair contracts
  "babyswap",        // BSC native with sufficient liquidity
]);

function dexNameToExecutorKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "_");
}

function isExecutableDex(displayName: string): boolean {
  return KNOWN_BSC_EXECUTOR_KEYS.has(dexNameToExecutorKey(displayName));
}

function isEthAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{38,42}$/.test(s);
}

function normalizeDexName(dexId: string): string {
  const lower = dexId.toLowerCase();
  for (const [key, val] of Object.entries(DEX_NAME_MAP)) {
    if (lower === key || lower.startsWith(key)) return val;
  }
  return dexId;
}

// BSC token addresses (BEP-20)
const BSC_TOKEN_ADDRESSES: Record<string, string> = {
  WBNB:  "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  BTCB:  "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
  ETH:   "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
  CAKE:  "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
  USDT:  "0x55d398326f99059fF775485246999027B3197955",
  BUSD:  "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
};

// Quote token labels used in pair display
const QUOTE_LABELS: Record<string, string> = {
  "0x55d398326f99059fF775485246999027B3197955": "USDT",
  "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56": "BUSD",
  "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d": "USDC",
  "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c": "WBNB",
};

export async function fetchDexPairsForToken(tokenSymbol: string): Promise<DexPairPrice[]> {
  const address = BSC_TOKEN_ADDRESSES[tokenSymbol];
  if (!address) return [];

  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${address}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json() as any;
    if (!data?.pairs) return [];

    const results: DexPairPrice[] = [];
    for (const p of data.pairs) {
      if (p.chainId !== "bsc") continue;
      if (!p.priceUsd || !p.dexId) continue;
      // Skip DEXes identified only by contract address (unnamed/unknown DEXes)
      if (isEthAddress(p.dexId)) continue;
      const liquidity = p.liquidity?.usd ?? 0;
      if (liquidity < 100000) continue;

      const priceUsd = parseFloat(p.priceUsd);
      if (isNaN(priceUsd) || priceUsd <= 0) continue;

      const baseSymbol = p.baseToken?.symbol?.toUpperCase() ?? "";
      const quoteSymbol = p.quoteToken?.symbol?.toUpperCase() ?? "";

      let normalizedPrice = priceUsd;
      let pairLabel = `${baseSymbol}/${quoteSymbol}`;

      if (baseSymbol !== tokenSymbol) {
        if (quoteSymbol === tokenSymbol) {
          normalizedPrice = 1 / priceUsd;
          pairLabel = `${quoteSymbol}/${baseSymbol}`;
        } else {
          continue;
        }
      }

      results.push({
        dex: normalizeDexName(p.dexId),
        pair: pairLabel,
        tokenSymbol,
        priceNormalized: normalizedPrice,
        liquidity,
        volume24h: p.volume?.h24 ?? 0,
        pairAddress: p.pairAddress ?? "",
      });
    }
    return results;
  } catch {
    return [];
  }
}

export async function fetchCoinGeckoPrices(): Promise<Record<string, number>> {
  try {
    const ids = "binancecoin,bitcoin,ethereum,pancakeswap-token,tether,binance-usd,usd-coin";
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json() as Record<string, { usd: number }>;
    return {
      BNB:  data["binancecoin"]?.usd ?? 600,
      WBNB: data["binancecoin"]?.usd ?? 600,
      BTCB: data["bitcoin"]?.usd ?? 67000,
      ETH:  data["ethereum"]?.usd ?? 3400,
      CAKE: data["pancakeswap-token"]?.usd ?? 2.5,
      USDT: data["tether"]?.usd ?? 1,
      BUSD: data["binance-usd"]?.usd ?? 1,
      USDC: data["usd-coin"]?.usd ?? 1,
    };
  } catch {
    return { BNB: 600, WBNB: 600, BTCB: 67000, ETH: 3400, CAKE: 2.5, USDT: 1, BUSD: 1, USDC: 1 };
  }
}

export function detectArbitrageFromPairs(
  pairs: DexPairPrice[],
  gasPrice: number,
  bnbPriceUsd: number = 600,
): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];
  const byToken = new Map<string, DexPairPrice[]>();

  for (const p of pairs) {
    const key = p.tokenSymbol;
    const arr = byToken.get(key) ?? [];
    arr.push(p);
    byToken.set(key, arr);
  }

  const safeGas = isNaN(gasPrice) || gasPrice <= 0 ? 5 : gasPrice;
  const safeBnb = isNaN(bnbPriceUsd) || bnbPriceUsd <= 0 ? 600 : bnbPriceUsd;
  // Gas per strategy: cross_dex ~200k, flash_loan ~380k, triangular ~300k
  const gasCostCrossDex = safeGas * 200_000 * 1e-9 * safeBnb;
  const gasCostFlashLoan = safeGas * 380_000 * 1e-9 * safeBnb;
  const gasCostTriangular = safeGas * 300_000 * 1e-9 * safeBnb;

  for (const [token, dexPairs] of byToken.entries()) {
    const uniqueDexPairs: Map<string, DexPairPrice> = new Map();
    for (const dp of dexPairs) {
      const existing = uniqueDexPairs.get(dp.dex);
      if (!existing || dp.liquidity > existing.liquidity) {
        uniqueDexPairs.set(dp.dex, dp);
      }
    }
    const uniq = Array.from(uniqueDexPairs.values());
    if (uniq.length < 2) continue;

    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const a = uniq[i]!;
        const b = uniq[j]!;

        // In the flash-swap model:
        //   BUY leg:  borrow tokenA → swap tokenA→tokenB at buyDex
        //             want tokenA to be MOST valuable here → get most tokenB
        //   SELL leg: swap tokenB→tokenA at sellDex to repay
        //             want tokenA to be CHEAPEST here → get most tokenA back
        //
        // So: buyDex = DEX with HIGHER tokenA price, sellDex = DEX with LOWER tokenA price.
        const [buyDex, sellDex, buyPrice, sellPrice] =
          a.priceNormalized > b.priceNormalized
            ? [a.dex, b.dex, a.priceNormalized, b.priceNormalized]
            : [b.dex, a.dex, b.priceNormalized, a.priceNormalized];

        const priceDiff = buyPrice - sellPrice; // always positive
        const diffPct = (priceDiff / sellPrice) * 100;

        // Minimum spread needed to cover all fees:
        //   flash loan fee: 0.25%
        //   buy DEX swap fee: ~0.25–0.35%  (use 0.3% conservative)
        //   sell DEX swap fee: ~0.25–0.35% (use 0.3% conservative)
        //   total: ~0.85% — require 1.0% to have meaningful margin
        if (diffPct < 1.0 || diffPct > 10) continue;

        const FLASH_FEE    = 0.0025; // PancakeSwap flash loan
        const DEX_FEE_EACH = 0.003;  // per swap leg (conservative)
        const totalFeeRate = FLASH_FEE + DEX_FEE_EACH * 2; // 0.85%

        const maxLiquidity = Math.min(a.liquidity, b.liquidity);
        const tradeAmountUsd = Math.min(maxLiquidity * 0.02, 100000);
        const tokenAmount = tradeAmountUsd / buyPrice;

        // Gross profit (buyPrice > sellPrice → positive)
        const rawProfitUsd = tokenAmount * (buyPrice - sellPrice);
        // Subtract fee cost from the loan amount
        const feesCostUsd  = tradeAmountUsd * totalFeeRate;

        const strategy: "cross_dex" | "flash_loan" =
          tradeAmountUsd > 20000 ? "flash_loan" : "cross_dex";

        const gasEstimateUsd = strategy === "flash_loan" ? gasCostFlashLoan : gasCostCrossDex;
        const profitAfterDexFees = rawProfitUsd - feesCostUsd;
        const netProfitUsd = profitAfterDexFees - gasEstimateUsd;

        if (netProfitUsd < 1.0) continue;

        const quoteToken = ["USDT", "BUSD", "USDC"].includes(token) ? "WBNB" : "USDT";
        const tokenPairLabel = `${token}/${quoteToken}`;

        // Only include opportunities where both DEXes have known on-chain routers
        if (!isExecutableDex(buyDex) || !isExecutableDex(sellDex)) continue;

        opportunities.push({
          tokenPair: tokenPairLabel,
          buyDex,
          sellDex,
          buyPrice,
          sellPrice,
          profitPercent: diffPct,
          profitUsd: profitAfterDexFees,
          gasEstimateUsd,
          netProfitUsd,
          strategy,
          amountIn: tradeAmountUsd,
          detectedAt: new Date(),
        });
      }
    }
  }

  return opportunities.sort((a, b) => b.netProfitUsd - a.netProfitUsd).slice(0, 20);
}
