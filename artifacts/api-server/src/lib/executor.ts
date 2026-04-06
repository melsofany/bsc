import { ethers } from "ethers";
import {
  FLASH_LOAN_ARB_ABI,
  UNISWAP_V2_ROUTER_ABI,
  UNISWAP_V3_ROUTER_ABI,
  PANCAKESWAP_V3_ROUTER_ABI,
  PANCAKE_FACTORY_ABI,
  PANCAKE_PAIR_ABI,
  PANCAKE_FACTORY_BSC,
  BISWAP_FACTORY_BSC,
  APESWAP_FACTORY_BSC,
  DEX_SELL_VERSION,
  DEX_SELL_FEE,
  SELL_DEX_V2,
  DEX_ROUTERS,
  DEX_VERSION,
  TOKEN_ADDRESSES,
} from "./abi.js";
import { fetchCoinGeckoPrices } from "./prices.js";
import { fetchBscGasPrice } from "./blockchain.js";

// ─── RPC / provider ────────────────────────────────────────────────────────

const PUBLIC_RPC: Record<string, string> = {
  ethereum:    "https://eth.llamarpc.com",
  polygon:     "https://polygon-rpc.com",
  arbitrum:    "https://arbitrum.llamarpc.com",
  bsc:         "https://bsc-dataseed1.binance.org",
  binance:     "https://bsc-dataseed1.binance.org",
  bsc_testnet: "https://data-seed-prebsc-1-s1.binance.org:8545",
};

const NETWORK_CHAIN_IDS: Record<string, number> = {
  ethereum:    1,
  polygon:     137,
  arbitrum:    42161,
  bsc:         56,
  binance:     56,
  bsc_testnet: 97,
};

const BSC_MAINNET_RPCS = [
  "https://bsc-dataseed1.binance.org",
  "https://bsc-dataseed2.binance.org",
  "https://bsc-dataseed3.binance.org",
  "https://bsc-dataseed4.binance.org",
  "https://bsc-rpc.publicnode.com",
  "https://bsc.drpc.org",
];

const BSC_TESTNET_RPCS = [
  "https://data-seed-prebsc-1-s1.binance.org:8545",
  "https://data-seed-prebsc-2-s1.binance.org:8545",
  "https://bsc-testnet-rpc.publicnode.com",
];

function makeProvider(url: string, chainId: number): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(url, chainId, { staticNetwork: true });
}

async function getProviderFromList(rpcs: string[], chainId: number): Promise<ethers.JsonRpcProvider> {
  for (const rpc of rpcs) {
    try {
      const p = makeProvider(rpc, chainId);
      await Promise.race([p.getBlockNumber(), new Promise((_,r) => setTimeout(() => r(new Error("timeout")), 4000))]);
      return p;
    } catch { continue; }
  }
  return makeProvider(rpcs[0]!, chainId);
}

async function getBscProvider(): Promise<ethers.JsonRpcProvider> {
  return getProviderFromList(BSC_MAINNET_RPCS, 56);
}

async function getProviderWithFallback(network: string): Promise<ethers.JsonRpcProvider> {
  if (network === "bsc" || network === "binance") return getBscProvider();
  if (network === "bsc_testnet") return getProviderFromList(BSC_TESTNET_RPCS, 97);
  const url     = PUBLIC_RPC[network]        || PUBLIC_RPC.ethereum;
  const chainId = NETWORK_CHAIN_IDS[network] || 1;
  return makeProvider(url, chainId);
}

// ─── PancakeSwap pair lookup ───────────────────────────────────────────────

async function getPancakePair(
  provider: ethers.Provider,
  tokenA: string,
  tokenB: string,
): Promise<string | null> {
  try {
    const factory = new ethers.Contract(PANCAKE_FACTORY_BSC, PANCAKE_FACTORY_ABI, provider);
    const pair: string = await factory.getPair(tokenA, tokenB);
    if (!pair || pair === ethers.ZeroAddress) return null;
    const pairContract = new ethers.Contract(pair, PANCAKE_PAIR_ABI, provider);
    const [r0, r1] = await pairContract.getReserves();
    if (r0 === 0n && r1 === 0n) return null;
    return pair;
  } catch {
    return null;
  }
}

// Lookup a pair from an arbitrary V2-compatible factory (BiSwap, ApeSwap, etc.)
async function getV2ForkPair(
  provider: ethers.Provider,
  factoryAddress: string,
  tokenA: string,
  tokenB: string,
): Promise<string | null> {
  try {
    const factory = new ethers.Contract(factoryAddress, PANCAKE_FACTORY_ABI, provider);
    const pair: string = await factory.getPair(tokenA, tokenB);
    if (!pair || pair === ethers.ZeroAddress) return null;
    return pair;
  } catch {
    return null;
  }
}

// PancakeSwap V2 storage layout: unlocked is at slot 12.
// All V2 forks (BiSwap, ApeSwap, BabySwap) copy-paste PancakeSwap's code so they
// use the same layout — and the same "Pancake: LOCKED" error message.
async function isPairUnlocked(provider: ethers.Provider, pairAddress: string): Promise<boolean> {
  try {
    const lockSlot = await provider.getStorage(pairAddress, 12);
    return BigInt(lockSlot) === 1n;
  } catch {
    return true; // assume unlocked on RPC error (non-fatal)
  }
}

// Mapping from executor DEX key → factory address used by that DEX's AMM
const DEX_FACTORY_BSC: Record<string, string> = {
  biswap:   BISWAP_FACTORY_BSC,
  apeswap:  APESWAP_FACTORY_BSC,
  babyswap: "0x86407bEa2078ea5f5EB5A52B2caA963bC1F889Da",
};

// ─── Calldata builders for the BUY leg only ───────────────────────────────
// The sell leg calldata is built inside the contract (it needs the on-chain balance).
// The buy leg amount is fixed (= loanAmount), so it can be pre-encoded off-chain.

const PANCAKESWAP_V3_DEXES = new Set(["pancakeswap_v3"]);

function buildBuyCalldataV3(
  dex: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  recipient: string,
): string {
  if (PANCAKESWAP_V3_DEXES.has(dex)) {
    // PancakeSwap V3 — no deadline in struct
    const iface = new ethers.Interface(PANCAKESWAP_V3_ROUTER_ABI);
    return iface.encodeFunctionData("exactInputSingle", [{
      tokenIn, tokenOut, fee: 2500, recipient, amountIn,
      amountOutMinimum: 0n, sqrtPriceLimitX96: 0n,
    }]);
  } else {
    // Uniswap V3 and others — includes deadline
    const iface = new ethers.Interface(UNISWAP_V3_ROUTER_ABI);
    return iface.encodeFunctionData("exactInputSingle", [{
      tokenIn, tokenOut, fee: 3000, recipient,
      deadline: Math.floor(Date.now() / 1000) + 120,
      amountIn, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n,
    }]);
  }
}

function buildBuyCalldata(
  dex: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  recipient: string,
): string {
  const version = DEX_VERSION[dex] || "v2";
  if (version === "v3") {
    return buildBuyCalldataV3(dex, tokenIn, tokenOut, amountIn, recipient);
  }
  const iface = new ethers.Interface(UNISWAP_V2_ROUTER_ABI);
  return iface.encodeFunctionData("swapExactTokensForTokens", [
    amountIn, 0n, [tokenIn, tokenOut], recipient,
    Math.floor(Date.now() / 1000) + 300,
  ]);
}

// ─── Sell DEX metadata ────────────────────────────────────────────────────
// Returns sellDexVersion (0=V2, 1=UniV3, 2=PancakeV3) and sellFee used by the contract
// to pick the right router interface for the sell leg.

function getSellDexVersion(dex: string): number {
  return DEX_SELL_VERSION[dex] ?? SELL_DEX_V2;
}

function getSellFeeTier(dex: string): number {
  return DEX_SELL_FEE[dex] ?? 0;
}

// ─── Revert reason decoder ────────────────────────────────────────────────
// Attempts to extract a human-readable revert reason from any ethers error.

function decodeRevertReason(err: any): string {
  // ethers v6 decoded reason
  if (err?.reason && typeof err.reason === "string") return err.reason;

  // Custom error / revert string from shortMessage
  if (err?.shortMessage && typeof err.shortMessage === "string") {
    const m = err.shortMessage;
    // Strip ethers wrapper prefix for readability
    const inner = m.replace(/^.*?revert\s*/i, "").trim();
    if (inner) return inner || m;
  }

  // Raw revert data — Error(string) ABI encoding: 0x08c379a0 + abi.encode(string)
  const raw: string | undefined = err?.data ?? err?.error?.data;
  if (raw && typeof raw === "string" && raw.startsWith("0x08c379a0")) {
    try {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ["string"],
        "0x" + raw.slice(10), // strip 4-byte selector
      );
      if (decoded[0]) return decoded[0] as string;
    } catch { }
  }

  // Panic(uint256) — 0x4e487b71
  if (raw && typeof raw === "string" && raw.startsWith("0x4e487b71")) {
    try {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], "0x" + raw.slice(10));
      return `Panic(${decoded[0]})`;
    } catch { }
  }

  return err?.message ?? "Transaction reverted on-chain";
}

// ─── Result type ──────────────────────────────────────────────────────────

export interface ExecutionResult {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  gasUsed?: string;
  gasCostEth?: string;
  gasCostUsd?: string;
  profitEth?: string;
  profitUsd?: string;
  error?: string;
  simulated: boolean;
}

// ─── Live execution ───────────────────────────────────────────────────────

export async function executeArbitrageLive(params: {
  privateKey: string;
  contractAddress: string;
  network: string;
  tokenPair: string;
  buyDex: string;
  sellDex: string;
  flashLoanAmount: string;
  flashbotsEnabled?: boolean;
}): Promise<ExecutionResult> {
  try {
    const provider           = await getProviderWithFallback(params.network);
    const wallet             = new ethers.Wallet(params.privateKey, provider);
    const cgPrices           = await fetchCoinGeckoPrices();
    const nativeTokenPriceUsd = cgPrices["BNB"] || cgPrices["WBNB"] || 600;

    // PancakeSwap flash swaps are BSC-only
    const isBsc = params.network === "bsc" || params.network === "binance";
    if (!isBsc) {
      return { success: false, error: `PancakeSwap Flash Swap is BSC-only. Network: ${params.network}`, simulated: false };
    }

    const [tokenA, tokenB] = params.tokenPair.split("/");
    const networkTokens    = TOKEN_ADDRESSES[params.network];
    if (!networkTokens) throw new Error(`Unsupported network: ${params.network}`);

    const tokenAInfo = networkTokens[tokenA!];
    const tokenBInfo = networkTokens[tokenB!];
    if (!tokenAInfo || !tokenBInfo) throw new Error(`Invalid token pair: ${params.tokenPair}`);

    // Find the PancakeSwap V2 pair to borrow from
    const pairAddress = await getPancakePair(provider, tokenAInfo.address, tokenBInfo.address);
    if (!pairAddress) {
      return { success: false, error: `No PancakeSwap V2 pair with liquidity for ${tokenA}/${tokenB}`, simulated: false };
    }
    console.log(`[executor] pair=${pairAddress} tokenA=${tokenA}(${tokenAInfo.address}) tokenB=${tokenB}(${tokenBInfo.address})`);

    // Verify contract is deployed
    const code = await provider.getCode(params.contractAddress);
    if (!code || code === "0x") {
      return { success: false, error: "Contract not deployed. Deploy PancakeFlashArbitrage first.", simulated: false };
    }

    const contract = new ethers.Contract(params.contractAddress, FLASH_LOAN_ARB_ABI, wallet);

    // Convert flash loan USD amount → token units
    const loanUsd        = Math.min(parseFloat(params.flashLoanAmount) || 10000, 50000);
    const tokenAPriceUsd = cgPrices[tokenA!] ?? cgPrices[tokenA!.replace(/^W/, "")] ?? 1;
    const loanTokenAmt   = tokenAPriceUsd > 0 ? loanUsd / tokenAPriceUsd : loanUsd;
    const decimals       = Math.min(tokenAInfo.decimals, 8);
    const loanAmount     = ethers.parseUnits(loanTokenAmt.toFixed(decimals), tokenAInfo.decimals);

    const buyDexKey  = params.buyDex.toLowerCase().replace(/\s+/g, "_");
    const sellDexKey = params.sellDex.toLowerCase().replace(/\s+/g, "_");
    const networkDexes = DEX_ROUTERS[params.network] ?? DEX_ROUTERS["bsc"] ?? {};
    const fallbackRouter = networkDexes["pancakeswap_v2"];

    // ── Reentrancy guard: "Pancake: LOCKED" prevention ───────────────────────
    // The flash loan borrows from a PancakeSwap V2 pair contract. That pair's
    // reentrancy lock stays engaged for the ENTIRE flash callback duration.
    // Any leg that routes through the same PancakeSwap V2 pair will revert.
    //
    // Root cause of "Pre-flight simulation failed: Pancake: LOCKED":
    //   pancakeswap_v3 (SwapRouter 0x1b81...) is also UNSAFE inside a V2 flash
    //   callback. On BSC, PancakeSwap V3's SwapRouter can internally route through
    //   V2 pair contracts (shared pool registry) when no adequate V3 pool exists at
    //   the requested fee tier. This re-enters the locked V2 pair → "Pancake: LOCKED".
    //
    // Protocols that must NOT be used inside the flash-swap callback:
    //   pancakeswap_v2  → shares pair contracts with the flash loan source → LOCKED
    //   pancakeswap_v3  → may fall back to V2 pair routing on BSC → LOCKED
    //   pancakeswap_ss  → custom curve AMM, uses PancakeSwap infrastructure → LOCKED
    //   uniswap_v3      → no official BSC deployment; router 0xB971 has no pools
    //   sushiswap       → negligible BSC liquidity — high failure rate
    //   mdex / knightswap / waultswap / nomiswap → tiny/inactive on BSC
    const UNSAFE_PROTOCOLS  = new Set([
      "pancakeswap_v2", "pancakeswap_v3", "pancakeswap_ss",
      "uniswap_v3", "sushiswap",
      "mdex", "knightswap", "waultswap", "nomiswap",
    ]);
    // Safe alternatives: independent V2 AMM forks with their own factory/pair contracts.
    // These do NOT share pair addresses with PancakeSwap V2, so the V2 flash-swap
    // reentrancy lock never affects them.
    //   biswap   → high BSC liquidity, own factory 0x858E...
    //   apeswap  → active BSC DEX, own factory 0x0841...
    //   babyswap → BSC native, own factory
    const SAFE_ALTERNATIVES = ["biswap", "apeswap", "babyswap"];

    function promoteDex(dexKey: string, role: "buy" | "sell", exclude?: string): string {
      // Keep the DEX unchanged only when it is safe AND doesn't duplicate the other leg.
      // Previously the exclude check was missing, so "biswap" (safe) passed through even
      // when the buy leg had already been promoted to "biswap" — causing buy === sell.
      if (!UNSAFE_PROTOCOLS.has(dexKey) && dexKey !== exclude) return dexKey;
      // Pick the first available safe alternative that is neither unsafe nor the other leg's DEX
      const alt = SAFE_ALTERNATIVES.find(k => k !== exclude && networkDexes[k]);
      if (alt) return alt;
      throw new Error(
        `${role === "buy" ? "Buy" : "Sell"} DEX "${dexKey}" is unavailable on BSC ` +
        `— no safe alternative router found. Check DEX_ROUTERS config.`
      );
    }

    const effectiveBuyDexKey  = promoteDex(buyDexKey,  "buy");
    // Pass effectiveBuyDexKey as the exclude so sell never resolves to the same DEX
    const effectiveSellDexKey = promoteDex(sellDexKey, "sell", effectiveBuyDexKey);
    console.log(`[executor] dex: buy=${buyDexKey}→${effectiveBuyDexKey} sell=${sellDexKey}→${effectiveSellDexKey}`);

    if (effectiveBuyDexKey === effectiveSellDexKey) {
      return {
        success: false,
        error: `Buy and sell DEX resolved to the same protocol (${effectiveBuyDexKey}) — no arbitrage route available.`,
        simulated: false,
      };
    }

    const buyRouter  = networkDexes[effectiveBuyDexKey]  ?? fallbackRouter;
    const sellRouter = networkDexes[effectiveSellDexKey] ?? fallbackRouter;
    if (!buyRouter)  throw new Error(`Buy DEX router not found: ${effectiveBuyDexKey}`);
    if (!sellRouter) throw new Error(`Sell DEX router not found: ${effectiveSellDexKey}`);

    // Build buy-leg calldata off-chain (amount is fixed = loanAmount)
    // Sell-leg is handled by the contract using on-chain actual balance
    const buyCd = buildBuyCalldata(effectiveBuyDexKey, tokenAInfo.address, tokenBInfo.address, loanAmount, params.contractAddress);

    // Sell DEX routing metadata — tells the contract which interface to call
    const sellDexVersion = getSellDexVersion(effectiveSellDexKey);
    const sellFee        = getSellFeeTier(effectiveSellDexKey);

    const feeData  = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? ethers.parseUnits("5", "gwei");
    const gasLimit = 600_000n;   // slightly higher for V3 sell path

    const nonce    = ethers.hexlify(ethers.randomBytes(32));
    const deadline = Math.floor(Date.now() / 1000) + 300;

    const arbParams = {
      pair:           pairAddress,
      tokenBorrow:    tokenAInfo.address,
      tokenOut:       tokenBInfo.address,
      loanAmount,
      buyDex:         buyRouter,
      sellDex:        sellRouter,
      minProfitBps:   1n,
      buyCalldata:    buyCd,
      sellDexVersion,
      sellFee,
      deadline,
      nonce,
    };

    // ── Pre-flight: verify the flash loan source pair is unlocked ───────────
    // Only the PancakeSwap V2 flash-swap pair needs an explicit slot-12 check.
    // We do NOT check the buy/sell DEX pairs (BiSwap, ApeSwap) here because:
    //   a) Their pair contracts are BiSwap/ApeSwap forks with different storage
    //      layouts — slot 12 is NOT guaranteed to be `unlocked` for those DEXes.
    //   b) Any transient lock on buy/sell pairs is caught by the callStatic retry
    //      loop below (3 retries × 3 s), which works against actual on-chain state.
    try {
      const flashPairLocked = !(await isPairUnlocked(provider, pairAddress));
      console.log(`[executor] flash pair ${pairAddress} locked=${flashPairLocked}`);
      if (flashPairLocked) {
        return {
          success: false,
          error: `Flash loan pair is temporarily locked — skipping to avoid Pancake: LOCKED. Retry in the next block.`,
          simulated: false,
        };
      }
    } catch (e) {
      console.warn(`[executor] flash pair lock check failed (non-fatal):`, e);
    }

    // ── Pre-flight simulation (callStatic) ──────────────────────────────────
    // Catch reverts before spending real gas on a doomed transaction.
    // Retry up to 3 times if LOCKED (transient BSC congestion).
    let simError: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // gasPrice is intentionally omitted — not needed for simulation
        await contract.executeArbitrage.staticCall(arbParams, { gasLimit });
        simError = null;
        console.log(`[executor] callStatic passed on attempt ${attempt}`);
        break;
      } catch (e: any) {
        simError = e;
        const reason = decodeRevertReason(e);
        const isLocked = reason.toLowerCase().includes("locked");
        const rawData = e?.data ?? e?.error?.data ?? "(none)";
        console.log(`[executor] callStatic attempt ${attempt} failed: "${reason}" (isLocked=${isLocked}) rawData=${typeof rawData === "string" ? rawData.slice(0, 80) : rawData}`);
        if (isLocked && attempt < 3) {
          // Pair briefly locked by a concurrent tx — wait one BSC block (~3s) and retry
          await new Promise(r => setTimeout(r, 3000 * attempt));
          continue;
        }
        break;
      }
    }

    if (simError) {
      const reason = decodeRevertReason(simError);
      return {
        success: false,
        error: `Pre-flight simulation failed (tx not sent): ${reason}`,
        simulated: false,
      };
    }

    // Single ArbInput struct — contract's executeArbitrage(ArbInput calldata inp)
    const tx = await contract.executeArbitrage(arbParams, { gasLimit, gasPrice });

    let receipt: ethers.TransactionReceipt | null = null;
    try {
      receipt = await tx.wait();
    } catch (waitErr: any) {
      const failedReceipt = waitErr?.receipt as ethers.TransactionReceipt | undefined;
      const txHash        = failedReceipt?.hash ?? tx.hash;
      const gasUsed       = failedReceipt?.gasUsed?.toString();
      const explorerUrl   = `https://bscscan.com/tx/${txHash}`;
      const revertReason  = decodeRevertReason(waitErr);
      return { success: false, txHash, gasUsed, error: `On-chain revert: ${revertReason}. Tx: ${explorerUrl}`, simulated: false };
    }

    if (!receipt || receipt.status !== 1) {
      return { success: false, txHash: receipt?.hash ?? tx.hash, error: "Transaction mined but reverted (status=0)", simulated: false };
    }

    const actualGasPrice = receipt.gasPrice ?? gasPrice;
    const gasCostWei     = receipt.gasUsed * actualGasPrice;
    const gasCostEth     = ethers.formatEther(gasCostWei);
    const gasCostUsd     = (parseFloat(gasCostEth) * nativeTokenPriceUsd).toFixed(6);

    let profitEth = "0";
    let profitUsd = "0";
    const arbIface = new ethers.Interface(FLASH_LOAN_ARB_ABI);
    for (const log of receipt.logs) {
      try {
        const parsed = arbIface.parseLog({ topics: log.topics as string[], data: log.data });
        if (parsed?.name === "ArbitrageExecuted") {
          const profitRaw = parsed.args["profit"] as bigint;
          profitEth = ethers.formatEther(profitRaw);
          profitUsd = (parseFloat(profitEth) * nativeTokenPriceUsd).toFixed(6);
          break;
        }
      } catch { }
    }

    return {
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      gasCostEth, gasCostUsd, profitEth, profitUsd,
      simulated: false,
    };

  } catch (err: any) {
    const msg: string = err?.shortMessage ?? err?.reason ?? err?.message ?? "Unknown error";
    return { success: false, error: msg, simulated: false };
  }
}

// ─── Simulation (no on-chain tx) ──────────────────────────────────────────

export async function simulateArbitrage(params: {
  tokenPair: string;
  buyDex: string;
  sellDex: string;
  profitEstimate: string;
  gasEstimate: string;
  netProfit: string;
  network: string;
  flashLoanAmount: string;
  flashbotsEnabled?: boolean;
}): Promise<ExecutionResult> {
  const [cgPrices, gasPrice] = await Promise.all([
    fetchCoinGeckoPrices(),
    fetchBscGasPrice(),
  ]);

  const nativePriceUsd   = cgPrices["BNB"] || cgPrices["WBNB"] || 600;
  const estimatedGasUsed = 300_000;   // slightly higher to account for V3 paths
  const safeGasGwei      = isNaN(gasPrice) || gasPrice <= 0 ? 5 : gasPrice;
  const gasCostBnb       = safeGasGwei * estimatedGasUsed * 1e-9;
  const gasCostUsd       = (gasCostBnb * nativePriceUsd).toFixed(6);

  const netProfitUsd = parseFloat(params.netProfit);
  const profitUsd    = parseFloat(params.profitEstimate);
  const success      = netProfitUsd > 0;
  const profitBnb    = nativePriceUsd > 0 ? profitUsd / nativePriceUsd : 0;

  return {
    success,
    txHash: success ? "0x" + Buffer.from(ethers.randomBytes(32)).toString("hex") : undefined,
    gasUsed:    estimatedGasUsed.toString(),
    gasCostEth: gasCostBnb.toFixed(8),
    gasCostUsd,
    profitEth:  profitBnb.toFixed(8),
    profitUsd:  profitUsd.toFixed(6),
    simulated:  true,
  };
}

// ─── Wallet helpers ───────────────────────────────────────────────────────

export async function connectWallet(
  privateKey: string,
  network: string,
): Promise<{ address: string; balance: string; network: string }> {
  const provider = await getProviderWithFallback(network);
  const wallet   = new ethers.Wallet(privateKey, provider);
  let balance    = "0";
  try {
    balance = ethers.formatEther(await provider.getBalance(wallet.address));
  } catch { }
  return { address: wallet.address, balance, network };
}

export async function getWalletBalance(address: string, network: string): Promise<string> {
  try {
    const provider = await getProviderWithFallback(network);
    return ethers.formatEther(await provider.getBalance(address));
  } catch {
    return "0";
  }
}

async function hasCodeOnNetwork(address: string, rpcs: string[], chainId: number): Promise<boolean> {
  for (const rpc of rpcs) {
    try {
      const p = makeProvider(rpc, chainId);
      const code = await Promise.race([
        p.getCode(address),
        new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 6000)),
      ]);
      if (code && code !== "0x") return true;
    } catch { continue; }
  }
  return false;
}

export async function validateContractDeployment(
  contractAddress: string,
  network: string,
): Promise<{ valid: boolean; owner?: string; error?: string }> {
  try {
    const provider = await getProviderWithFallback(network);
    const code = await Promise.race([
      provider.getCode(contractAddress),
      new Promise<never>((_, r) => setTimeout(() => r(new Error("getCode timeout after 10s")), 10000)),
    ]);

    if (!code || code === "0x") {
      // Auto-detect: check if contract is on BSC testnet when mainnet selected
      if (network === "bsc" || network === "binance") {
        const onTestnet = await hasCodeOnNetwork(contractAddress, BSC_TESTNET_RPCS, 97);
        if (onTestnet) {
          return {
            valid: false,
            error: "Contract found on BSC Testnet (chain 97) — not BSC Mainnet (chain 56). Switch network to BSC Testnet in settings, or redeploy on BSC Mainnet.",
          };
        }
      }
      return { valid: false, error: "No bytecode at address — contract not deployed on " + network };
    }

    const contract = new ethers.Contract(contractAddress, FLASH_LOAN_ARB_ABI, provider);
    let owner: string | undefined;
    try { owner = await contract.owner(); } catch { }
    return { valid: true, owner };
  } catch (e: any) {
    return { valid: false, error: e?.message ?? "unknown error" };
  }
}
