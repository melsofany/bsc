import { useState } from "react";
import { useListOpportunities, useGetConfig, useGetWalletStatus, useExecuteOpportunity, getListOpportunitiesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Play, CheckCircle2, Zap, ShieldCheck, ShieldAlert } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";

function formatPrice(val: string | number | undefined | null): string {
  if (val === undefined || val === null || val === "") return "—";
  const n = Number(val);
  if (isNaN(n) || n === 0) return "—";
  if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(8)}`;
}

function formatLoan(val: string | number | undefined | null): string {
  if (val === undefined || val === null || val === "") return "—";
  const n = Number(val);
  if (isNaN(n) || n === 0) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatGas(val: string | number | undefined | null): string {
  if (val === undefined || val === null || val === "") return "—";
  const n = Number(val);
  if (isNaN(n) || n === 0) return "—";
  return `$${n.toFixed(4)}`;
}

function formatNetProfit(val: string | number | undefined | null): string {
  if (val === undefined || val === null || val === "") return "—";
  const n = Number(val);
  if (isNaN(n)) return "—";
  const sign = n >= 0 ? "" : "";
  return `${sign}$${Math.abs(n).toFixed(4)}`;
}

export default function Opportunities() {
  const { t } = useLang();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [executingId, setExecutingId] = useState<number | null>(null);

  const { data: opportunities, isLoading } = useListOpportunities({ limit: 50 });
  const { data: config } = useGetConfig();
  const { data: walletStatus } = useGetWalletStatus();

  const executeOpportunity = useExecuteOpportunity({
    mutation: {
      onSuccess: (data, variables) => {
        setExecutingId(null);
        queryClient.invalidateQueries({ queryKey: getListOpportunitiesQueryKey() });
        if (data.success) {
          const mevLabel = (data as any).mevProtected
            ? `🛡 ${(data as any).relay ?? t.opportunities.mevProtectedBadge}`
            : t.opportunities.mevUnprotectedBadge;
          const profitLine = `Net: $${data.profitUsd ?? "0"}`;
          toast({
            title: t.opportunities.executeSuccess,
            description: data.simulated
              ? `${t.opportunities.simMode} ${profitLine}`
              : `${mevLabel} | Tx: ${data.txHash?.slice(0, 18)}… | ${profitLine}`,
          });
        } else {
          toast({
            title: t.opportunities.executeFailed,
            description: data.error ?? t.opportunities.executeFailedDesc,
            variant: "destructive",
          });
        }
      },
      onError: (err: any) => {
        setExecutingId(null);
        toast({
          title: t.opportunities.executeFailed,
          description: err?.message ?? t.opportunities.executeFailedDesc,
          variant: "destructive",
        });
      },
    },
  });

  function handleExecute(opportunityId: number) {
    setExecutingId(opportunityId);
    executeOpportunity.mutate({ opportunityId });
  }

  const isLive = config?.mode === "live";
  const isWalletConnected = walletStatus?.connected === true;
  const isFlashbotsEnabled = config?.flashbotsEnabled === true;

  const getStrategyColor = (strategy: string) => {
    switch (strategy) {
      case 'cross_dex': return 'text-blue-400 border-blue-400/30 bg-blue-400/10';
      case 'triangular': return 'text-purple-400 border-purple-400/30 bg-purple-400/10';
      case 'sandwich': return 'text-orange-400 border-orange-400/30 bg-orange-400/10';
      case 'flash_loan': return 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10';
      default: return 'text-gray-400 border-gray-400/30 bg-gray-400/10';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'detected': return 'text-yellow-400 border-yellow-400/30';
      case 'executed': return 'text-green-400 border-green-400/30';
      case 'missed': return 'text-gray-400 border-gray-400/30';
      case 'failed': return 'text-red-400 border-red-400/30';
      default: return 'text-gray-400 border-gray-400/30';
    }
  };

  const getStrategyLabel = (strategy: string) => {
    return (t.strategies as any)[strategy] || strategy.replace('_', ' ');
  };

  const getStatusLabel = (status: string) => {
    return (t.statuses as any)[status] || status;
  };

  const COLS = 12;

  return (
    <div className="space-y-6">
      <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${isLive ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-border bg-muted/20 text-muted-foreground'}`}>
        <Zap className="h-3 w-3 shrink-0" />
        <span className="flex-1">
          {isLive
            ? isWalletConnected
              ? isFlashbotsEnabled
                ? t.opportunities.liveMevOn
                : t.opportunities.liveMevOff
              : "LIVE MODE — Connect a wallet in Settings to execute real trades"
            : t.opportunities.simMode}
        </span>
        {isLive && isWalletConnected && (
          <span className={`flex items-center gap-1 font-bold ml-2 shrink-0 ${isFlashbotsEnabled ? 'text-green-400' : 'text-yellow-500'}`}>
            {isFlashbotsEnabled
              ? <><ShieldCheck className="h-3 w-3" />{t.opportunities.mevProtectedBadge}</>
              : <><ShieldAlert className="h-3 w-3" />{t.opportunities.mevUnprotectedBadge}</>
            }
          </span>
        )}
      </div>

      <Card className="bg-card/50 border-border backdrop-blur">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-lg font-medium uppercase tracking-wider">{t.opportunities.opportunityLog}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[1100px]">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-mono uppercase text-xs whitespace-nowrap">{t.opportunities.time}</TableHead>
                <TableHead className="font-mono uppercase text-xs whitespace-nowrap">{t.opportunities.pair}</TableHead>
                <TableHead className="font-mono uppercase text-xs whitespace-nowrap">{t.opportunities.strategy}</TableHead>
                <TableHead className="font-mono uppercase text-xs whitespace-nowrap">{t.opportunities.route}</TableHead>
                <TableHead className="font-mono uppercase text-xs text-right whitespace-nowrap">{t.opportunities.loanSize}</TableHead>
                <TableHead className="font-mono uppercase text-xs text-right whitespace-nowrap">{t.opportunities.buyPrice}</TableHead>
                <TableHead className="font-mono uppercase text-xs text-right whitespace-nowrap">{t.opportunities.sellPrice}</TableHead>
                <TableHead className="font-mono uppercase text-xs text-right whitespace-nowrap">{t.opportunities.estProfit}</TableHead>
                <TableHead className="font-mono uppercase text-xs text-right whitespace-nowrap">{t.opportunities.estGas}</TableHead>
                <TableHead className="font-mono uppercase text-xs text-right whitespace-nowrap">{t.opportunities.netProfit}</TableHead>
                <TableHead className="font-mono uppercase text-xs text-right whitespace-nowrap">{t.opportunities.status}</TableHead>
                <TableHead className="font-mono uppercase text-xs text-right whitespace-nowrap">{t.opportunities.action}</TableHead>
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
              ) : opportunities?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLS} className="h-32 text-center text-muted-foreground">
                    {t.opportunities.noOpportunities}
                  </TableCell>
                </TableRow>
              ) : (
                opportunities?.map((op) => {
                  const isExecutable = op.status === "detected" && Number(op.netProfit) > 0;
                  const isThisExecuting = executingId === op.id;
                  const netProfitNum = Number(op.netProfit);
                  return (
                    <TableRow key={op.id} className="border-border border-b hover:bg-accent/50">
                      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(op.detectedAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
                      </TableCell>
                      <TableCell className="font-mono font-bold whitespace-nowrap">{op.tokenPair}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`font-mono text-[10px] uppercase whitespace-nowrap ${getStrategyColor(op.strategy)}`}>
                          {getStrategyLabel(op.strategy)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                          <span>{op.buyDex || '—'}</span>
                          <ArrowRight className="h-3 w-3 shrink-0" />
                          <span>{op.sellDex || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-right text-xs whitespace-nowrap text-muted-foreground">
                        {formatLoan(op.amountIn)}
                      </TableCell>
                      <TableCell className="font-mono text-right text-xs whitespace-nowrap text-green-400/80">
                        {formatPrice(op.buyPrice)}
                      </TableCell>
                      <TableCell className="font-mono text-right text-xs whitespace-nowrap text-red-400/80">
                        {formatPrice(op.sellPrice)}
                      </TableCell>
                      <TableCell className="font-mono text-right text-xs whitespace-nowrap text-muted-foreground">
                        {formatNetProfit(op.profitEstimate)}
                      </TableCell>
                      <TableCell className="font-mono text-right text-xs whitespace-nowrap text-yellow-500/70">
                        {formatGas(op.gasEstimate)}
                      </TableCell>
                      <TableCell className={`font-mono text-right text-xs whitespace-nowrap font-bold ${netProfitNum > 0 ? 'text-primary' : 'text-destructive'}`}>
                        {netProfitNum < 0 ? `-$${Math.abs(netProfitNum).toFixed(4)}` : formatNetProfit(op.netProfit)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {op.status === "executed" ? (
                          <div className="flex items-center justify-end gap-1">
                            <CheckCircle2 className="h-3 w-3 text-green-400" />
                            <Badge variant="outline" className={`font-mono text-[10px] uppercase ${getStatusColor(op.status)}`}>
                              {getStatusLabel(op.status)}
                            </Badge>
                          </div>
                        ) : (
                          <Badge variant="outline" className={`font-mono text-[10px] uppercase ${getStatusColor(op.status)}`}>
                            {getStatusLabel(op.status)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isExecutable ? (
                          <Button
                            size="sm"
                            variant={isLive ? "destructive" : "default"}
                            onClick={() => handleExecute(op.id)}
                            disabled={isThisExecuting || executingId !== null}
                            className="h-7 px-3 text-[10px] font-bold tracking-wider"
                          >
                            <Play className="h-3 w-3 mr-1" />
                            {isThisExecuting ? t.opportunities.executing : t.opportunities.execute}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
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
