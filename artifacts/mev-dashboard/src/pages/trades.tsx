import { useListTrades } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, ExternalLink } from "lucide-react";
import { useLang } from "@/lib/i18n";

const BSC_SCAN = "https://bscscan.com/tx/";

function truncateHash(hash: string): string {
  if (!hash || hash.length < 12) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function formatUsd(val: string | number | undefined | null, decimals = 4): string {
  if (val === undefined || val === null || val === "") return "—";
  const n = Number(val);
  if (isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs === 0) return "$0.00";
  const sign = n < 0 ? "-" : "";
  if (abs >= 1000) return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `${sign}$${abs.toFixed(decimals)}`;
}

function formatLoan(val: string | number | undefined | null): string {
  if (val === undefined || val === null || val === "") return "—";
  const n = Number(val);
  if (isNaN(n) || n === 0) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function Trades() {
  const { t } = useLang();
  const { data: trades, isLoading } = useListTrades({ limit: 50 });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'text-primary border-primary/30 bg-primary/10';
      case 'pending': return 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10';
      case 'failed': return 'text-destructive border-destructive/30 bg-destructive/10';
      case 'reverted': return 'text-orange-500 border-orange-500/30 bg-orange-500/10';
      default: return 'text-muted-foreground border-border bg-accent';
    }
  };

  const getStrategyColor = (strategy: string) => {
    switch (strategy) {
      case 'cross_dex': return 'text-blue-400 border-blue-400/30 bg-blue-400/10';
      case 'triangular': return 'text-purple-400 border-purple-400/30 bg-purple-400/10';
      case 'flash_loan': return 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10';
      default: return 'text-gray-400 border-gray-400/30 bg-gray-400/10';
    }
  };

  const getStatusLabel = (status: string) => (t.statuses as any)[status] || status;
  const getStrategyLabel = (strategy: string) => (t.strategies as any)[strategy] || strategy;

  const COLS = 12;

  return (
    <div className="space-y-6">
      <Card className="bg-card/50 border-border backdrop-blur">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-lg font-medium uppercase tracking-wider">{t.trades.executionHistory}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[1200px]">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-mono uppercase text-xs whitespace-nowrap">{t.trades.block}</TableHead>
                <TableHead className="font-mono uppercase text-xs whitespace-nowrap">{t.trades.time}</TableHead>
                <TableHead className="font-mono uppercase text-xs whitespace-nowrap">{t.trades.txHash}</TableHead>
                <TableHead className="font-mono uppercase text-xs whitespace-nowrap">{t.trades.pair}</TableHead>
                <TableHead className="font-mono uppercase text-xs whitespace-nowrap">{t.trades.strategy}</TableHead>
                <TableHead className="font-mono uppercase text-xs whitespace-nowrap">{t.trades.route}</TableHead>
                <TableHead className="font-mono uppercase text-xs text-right whitespace-nowrap">{t.trades.loanSize}</TableHead>
                <TableHead className="font-mono uppercase text-xs text-right whitespace-nowrap">{t.trades.grossProfit}</TableHead>
                <TableHead className="font-mono uppercase text-xs text-right whitespace-nowrap">{t.trades.gasCost}</TableHead>
                <TableHead className="font-mono uppercase text-xs text-right whitespace-nowrap">{t.trades.netProfit}</TableHead>
                <TableHead className="font-mono uppercase text-xs text-right whitespace-nowrap">{t.trades.status}</TableHead>
                <TableHead className="font-mono uppercase text-xs whitespace-nowrap">{t.trades.error}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    {Array.from({ length: COLS }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : trades?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLS} className="h-32 text-center text-muted-foreground">
                    {t.trades.noTrades}
                  </TableCell>
                </TableRow>
              ) : (
                trades?.map((trade) => {
                  const netProfit = Number(trade.netProfitUsd ?? 0);
                  const grossProfit = Number(trade.profitUsd ?? 0);
                  const gasCost = Number(trade.gasCostUsd ?? 0);
                  return (
                    <TableRow key={trade.id} className="border-border border-b hover:bg-accent/50 transition-colors">

                      {/* Block */}
                      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {trade.blockNumber
                          ? <a href={`https://bscscan.com/block/${trade.blockNumber}`} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">{trade.blockNumber.toLocaleString()}</a>
                          : '—'}
                      </TableCell>

                      {/* Time */}
                      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(trade.executedAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </TableCell>

                      {/* Tx Hash → BSCScan */}
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {trade.txHash ? (
                          <a
                            href={`${BSC_SCAN}${trade.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            {truncateHash(trade.txHash)}
                            <ExternalLink className="h-3 w-3 opacity-60" />
                          </a>
                        ) : '—'}
                      </TableCell>

                      {/* Pair */}
                      <TableCell className="font-mono font-bold text-sm whitespace-nowrap">
                        {trade.tokenPair}
                      </TableCell>

                      {/* Strategy */}
                      <TableCell>
                        <Badge variant="outline" className={`font-mono text-[10px] uppercase whitespace-nowrap ${getStrategyColor(trade.strategy)}`}>
                          {getStrategyLabel(trade.strategy)}
                        </Badge>
                      </TableCell>

                      {/* Route */}
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                          <span>{trade.buyDex || '—'}</span>
                          {trade.buyDex && trade.sellDex && <ArrowRight className="h-3 w-3 shrink-0" />}
                          <span>{trade.sellDex || ''}</span>
                        </div>
                      </TableCell>

                      {/* Loan Size */}
                      <TableCell className="font-mono text-right text-xs whitespace-nowrap text-muted-foreground">
                        {formatLoan(trade.flashLoanAmount ?? trade.amountIn)}
                      </TableCell>

                      {/* Gross Profit */}
                      <TableCell className={`font-mono text-right text-xs whitespace-nowrap ${grossProfit > 0 ? 'text-green-400' : 'text-muted-foreground'}`}>
                        {formatUsd(grossProfit)}
                      </TableCell>

                      {/* Gas Cost */}
                      <TableCell className="font-mono text-right text-xs whitespace-nowrap text-yellow-500/80">
                        {gasCost > 0 ? formatUsd(gasCost, 6) : '—'}
                      </TableCell>

                      {/* Net Profit */}
                      <TableCell className={`font-mono text-right font-bold text-sm whitespace-nowrap ${netProfit > 0 ? 'text-primary' : 'text-destructive'}`}>
                        {formatUsd(netProfit)}
                      </TableCell>

                      {/* Status */}
                      <TableCell className="text-right whitespace-nowrap">
                        <Badge variant="outline" className={`font-mono text-[10px] uppercase ${getStatusColor(trade.status)}`}>
                          {getStatusLabel(trade.status)}
                        </Badge>
                      </TableCell>

                      {/* Error */}
                      <TableCell className="text-xs text-destructive max-w-[180px] truncate" title={trade.error ?? ""}>
                        {trade.error ? trade.error : '—'}
                      </TableCell>

                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
