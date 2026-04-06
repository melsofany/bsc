// PancakeFlashArbitrage contract ABI
// Matches: contracts/FlashLoanArbitrage.sol
//
// sellDexVersion values (mirror contract constants):
//   0 = V2  (swapExactTokensForTokens)
//   1 = UniV3  (exactInputSingle WITH deadline)
//   2 = PancakeV3 (exactInputSingle WITHOUT deadline)
export const SELL_DEX_V2         = 0;
export const SELL_DEX_UNI_V3     = 1;
export const SELL_DEX_PANCAKE_V3 = 2;

export const FLASH_LOAN_ARB_ABI = [
  {
    inputs: [{ internalType: "address", name: "pancakeFactory", type: "address" }],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: "address", name: "tokenBorrow", type: "address" },
      { indexed: false, internalType: "uint256", name: "loanAmount",  type: "uint256" },
      { indexed: false, internalType: "uint256", name: "profit",      type: "uint256" },
      { indexed: false, internalType: "address", name: "buyDex",      type: "address" },
      { indexed: false, internalType: "address", name: "sellDex",     type: "address" },
      { indexed: false, internalType: "uint256", name: "timestamp",   type: "uint256" },
    ],
    name: "ArbitrageExecuted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "previousOwner", type: "address" },
      { indexed: true, internalType: "address", name: "newOwner",      type: "address" },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    inputs: [],
    name: "PANCAKE_FACTORY",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  // executeArbitrage(Params calldata p) — single struct avoids "stack too deep"
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "pair",           type: "address" },
          { internalType: "address", name: "tokenBorrow",    type: "address" },
          { internalType: "address", name: "tokenOut",       type: "address" },
          { internalType: "uint256", name: "loanAmount",     type: "uint256" },
          { internalType: "address", name: "buyDex",         type: "address" },
          { internalType: "address", name: "sellDex",        type: "address" },
          { internalType: "uint256", name: "minProfitBps",   type: "uint256" },
          { internalType: "bytes",   name: "buyCalldata",    type: "bytes"   },
          { internalType: "uint8",   name: "sellDexVersion", type: "uint8"   },
          { internalType: "uint24",  name: "sellFee",        type: "uint24"  },
          { internalType: "uint256", name: "deadline",       type: "uint256" },
          { internalType: "bytes32", name: "nonce",          type: "bytes32" },
        ],
        internalType: "struct PancakeFlashArbitrage.Params",
        name: "p",
        type: "tuple",
      },
    ],
    name: "executeArbitrage",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "sender",  type: "address" },
      { internalType: "uint256", name: "amount0", type: "uint256" },
      { internalType: "uint256", name: "amount1", type: "uint256" },
      { internalType: "bytes",   name: "data",    type: "bytes"   },
    ],
    name: "pancakeCall",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    name: "usedNonces",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "newOwner", type: "address" }],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "token", type: "address" }],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  { stateMutability: "payable", type: "receive" },
] as const;

// sellDexVersion and fee tier per DEX key — mirrors contract constants
export const DEX_SELL_VERSION: Record<string, number> = {
  pancakeswap_v3: SELL_DEX_PANCAKE_V3,
  uniswap_v3:     SELL_DEX_UNI_V3,
  camelot:        SELL_DEX_UNI_V3,   // Camelot uses Uniswap V3-compatible router
};

export const DEX_SELL_FEE: Record<string, number> = {
  pancakeswap_v3: 2500,
  uniswap_v3:     3000,
  camelot:        2500,
};

// Uniswap V3 exactInputSingle — includes deadline in struct
export const UNISWAP_V3_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "tokenIn",           type: "address" },
          { internalType: "address", name: "tokenOut",          type: "address" },
          { internalType: "uint24",  name: "fee",               type: "uint24"  },
          { internalType: "address", name: "recipient",         type: "address" },
          { internalType: "uint256", name: "deadline",          type: "uint256" },
          { internalType: "uint256", name: "amountIn",          type: "uint256" },
          { internalType: "uint256", name: "amountOutMinimum",  type: "uint256" },
          { internalType: "uint160", name: "sqrtPriceLimitX96", type: "uint160" },
        ],
        internalType: "struct ISwapRouter.ExactInputSingleParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "exactInputSingle",
    outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
] as const;

// PancakeSwap V3 exactInputSingle — NO deadline in struct (different from Uniswap V3)
export const PANCAKESWAP_V3_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "tokenIn",           type: "address" },
          { internalType: "address", name: "tokenOut",          type: "address" },
          { internalType: "uint24",  name: "fee",               type: "uint24"  },
          { internalType: "address", name: "recipient",         type: "address" },
          { internalType: "uint256", name: "amountIn",          type: "uint256" },
          { internalType: "uint256", name: "amountOutMinimum",  type: "uint256" },
          { internalType: "uint160", name: "sqrtPriceLimitX96", type: "uint160" },
        ],
        internalType: "struct IV3SwapRouter.ExactInputSingleParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "exactInputSingle",
    outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
] as const;

export const UNISWAP_V2_ROUTER_ABI = [
  {
    inputs: [
      { internalType: "uint256",    name: "amountIn",     type: "uint256"   },
      { internalType: "uint256",    name: "amountOutMin", type: "uint256"   },
      { internalType: "address[]",  name: "path",         type: "address[]" },
      { internalType: "address",    name: "to",           type: "address"   },
      { internalType: "uint256",    name: "deadline",     type: "uint256"   },
    ],
    name: "swapExactTokensForTokens",
    outputs: [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256",   name: "amountIn", type: "uint256"   },
      { internalType: "address[]", name: "path",     type: "address[]" },
    ],
    name: "getAmountsOut",
    outputs: [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// PancakeSwap V2 Factory — used to look up pair addresses
export const PANCAKE_FACTORY_ABI = [
  {
    inputs: [
      { internalType: "address", name: "tokenA", type: "address" },
      { internalType: "address", name: "tokenB", type: "address" },
    ],
    name: "getPair",
    outputs: [{ internalType: "address", name: "pair", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// PancakeSwap V2 Pair — used to read token order and reserves
export const PANCAKE_PAIR_ABI = [
  {
    inputs: [],
    name: "token0",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token1",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getReserves",
    outputs: [
      { internalType: "uint112", name: "reserve0",           type: "uint112" },
      { internalType: "uint112", name: "reserve1",           type: "uint112" },
      { internalType: "uint32",  name: "blockTimestampLast", type: "uint32"  },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const DEX_VERSION: Record<string, "v2" | "v3"> = {
  pancakeswap_v2: "v2",
  pancakeswap_v3: "v3",
  uniswap_v3:     "v3",
  biswap:         "v2",
  apeswap:        "v2",
  babyswap:       "v2",
  sushiswap:      "v2",
  uniswap_v2:     "v2",
  quickswap:      "v2",
  camelot:        "v3",
};

export const ERC20_ABI = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// PancakeSwap V2 Factory on BSC — the source of flash swaps
export const PANCAKE_FACTORY_BSC = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";

// Secondary V2 DEX factories on BSC — used for cross-DEX borrow source selection
export const BISWAP_FACTORY_BSC    = "0x858E3312ed3A876947EA49d572A7C42DE08af7EE";
export const APESWAP_FACTORY_BSC   = "0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6";

export const DEX_ROUTERS: Record<string, Record<string, string>> = {
  ethereum: {
    uniswap_v3: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    sushiswap:  "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
    uniswap_v2: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  },
  polygon: {
    uniswap_v3: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    quickswap:  "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
    sushiswap:  "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
  },
  arbitrum: {
    uniswap_v3: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    sushiswap:  "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
    camelot:    "0xc873fEcbd354f5A56E00E710B90EF4201db2448d",
  },
  bsc: {
    pancakeswap_v2:  "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    // Pure V3 SwapRouter — only routes through V3 concentrated-liquidity pools.
    // Do NOT use the SmartRouter (0x13f4EA83D0bd40E75C8222255bc855a974568Dd4) here:
    // the SmartRouter does mixed V2/V3 routing and will call the locked PancakeSwap
    // V2 pair inside a flash-swap callback → "Pancake: LOCKED".
    pancakeswap_v3:  "0x1b81D678ffb9C0263b24A97847620C99d213eB14",
    biswap:          "0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8",
    apeswap:         "0xcf0FeBD3f17CEf5B47B0cD171C2c7A8d9b56e1f4",
    babyswap:        "0x325E343f1dE602396E256B67eFd1F61C3A6B38Bd",
    // Thena uses Solidly AMM interface (incompatible with Uni V2/V3 ABI — excluded from execution)
    // thena:        "0xd4ae6eCA985340Dd434D38F470aCCce4DC78D109",
    // thena_v3:     "0x327Dd3208f0bCF590A66110aCB6e5e6941A4EfA0",
    mdex:            "0x7DAe51BD3E3376B8c7c4900E9107f12Be3AF1bA8",
    knightswap:      "0x05E61E0cDcD2170a76F9568a110CEe3AFdD6c46f",
    waultswap:       "0xD48745E39BbED146eEC15b79cBF964884F9877c2",
    nomiswap:        "0xD9a2AD9E927Bd7014116CC5c7328f028D4318178",
    sushiswap:       "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
    uniswap_v3:      "0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2",
    pancakeswap_ss:  "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  },
};

export const TOKEN_ADDRESSES: Record<string, Record<string, { address: string; decimals: number }>> = {
  ethereum: {
    WETH:  { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
    USDC:  { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6  },
    USDT:  { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6  },
    DAI:   { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
    WBTC:  { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8  },
  },
  polygon: {
    WETH:   { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18 },
    WMATIC: { address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18 },
    USDC:   { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6  },
    USDT:   { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6  },
    DAI:    { address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18 },
  },
  arbitrum: {
    WETH: { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18 },
    USDC: { address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", decimals: 6  },
    USDT: { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6  },
    DAI:  { address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18 },
  },
  bsc: {
    WBNB:  { address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", decimals: 18 },
    BUSD:  { address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", decimals: 18 },
    USDT:  { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
    USDC:  { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
    ETH:   { address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", decimals: 18 },
    BTCB:  { address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", decimals: 18 },
    CAKE:  { address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", decimals: 18 },
  },
};
