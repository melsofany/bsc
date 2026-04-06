const ETH_RPC = "https://eth.llamarpc.com";
const POLYGON_RPC = "https://polygon-rpc.com";
const BSC_RPC = "https://bsc-dataseed1.binance.org";

async function rpcCall(rpc: string, method: string, params: any[] = []) {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(5000),
  });
  const json = await res.json() as any;
  return json.result;
}

export async function fetchEthGasPrice(): Promise<number> {
  try {
    const hex = await rpcCall(ETH_RPC, "eth_gasPrice");
    if (!hex || typeof hex !== "string") return 25;
    const wei = parseInt(hex, 16);
    if (isNaN(wei) || wei <= 0) return 25;
    return Math.round(wei / 1e9 * 10) / 10;
  } catch {
    return 25;
  }
}

export async function fetchEthBlockNumber(): Promise<number> {
  try {
    const hex = await rpcCall(ETH_RPC, "eth_blockNumber");
    return parseInt(hex, 16);
  } catch {
    return 0;
  }
}

export async function fetchPendingTxCount(): Promise<number> {
  try {
    const hex = await rpcCall(ETH_RPC, "eth_getBlockTransactionCountByNumber", ["pending"]);
    return parseInt(hex, 16);
  } catch {
    return 0;
  }
}

export async function fetchPolygonGasPrice(): Promise<number> {
  try {
    const hex = await rpcCall(POLYGON_RPC, "eth_gasPrice");
    return Math.round(parseInt(hex, 16) / 1e9 * 10) / 10;
  } catch {
    return 32;
  }
}

export async function fetchPolygonBlockNumber(): Promise<number> {
  try {
    const hex = await rpcCall(POLYGON_RPC, "eth_blockNumber");
    return parseInt(hex, 16);
  } catch {
    return 0;
  }
}

export interface BlockchainStats {
  gasPrice: number;
  blockNumber: number;
  pendingTxCount: number;
  network: string;
}

export async function fetchBscGasPrice(): Promise<number> {
  try {
    const hex = await rpcCall(BSC_RPC, "eth_gasPrice");
    if (!hex || typeof hex !== "string") return 3;
    const wei = parseInt(hex, 16);
    if (isNaN(wei) || wei <= 0) return 3;
    return Math.round(wei / 1e9 * 10) / 10;
  } catch {
    return 3;
  }
}

async function fetchBscBlockNumber(): Promise<number> {
  try {
    const hex = await rpcCall(BSC_RPC, "eth_blockNumber");
    return parseInt(hex, 16);
  } catch {
    return 0;
  }
}

export async function fetchBlockchainStats(network: string = "ethereum"): Promise<BlockchainStats> {
  const isBsc = network === "bsc" || network === "binance";
  const isPolygon = network === "polygon";
  const [gasPrice, blockNumber, pendingTxCount] = await Promise.all([
    isBsc ? fetchBscGasPrice() : isPolygon ? fetchPolygonGasPrice() : fetchEthGasPrice(),
    isBsc ? fetchBscBlockNumber() : isPolygon ? fetchPolygonBlockNumber() : fetchEthBlockNumber(),
    fetchPendingTxCount(),
  ]);
  return { gasPrice, blockNumber, pendingTxCount, network };
}
