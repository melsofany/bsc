import { useGetMempoolStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Activity, Layers, Zap, Clock } from "lucide-react";
import { useLang } from "@/lib/i18n";

export default function Mempool() {
  const { t } = useLang();
  const { data: mempool, isLoading } = useGetMempoolStats({
    query: { refetchInterval: 5000 }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <div className="h-3 w-3 bg-primary rounded-full pulse-glow"></div>
            {t.mempool.liveStream}
          </h2>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            {t.mempool.processingRealtime}
          </p>
        </div>
        <div className="text-right font-mono">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t.mempool.lastBlock}</div>
          <div className="text-lg font-bold text-primary">#{mempool?.lastBlockNumber || '-----'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-card/50 backdrop-blur border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t.mempool.pendingTxs}</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-4xl font-mono font-bold text-foreground">
                {mempool?.pendingTxCount?.toLocaleString() || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t.mempool.swapsDetected}</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-4xl font-mono font-bold text-primary">
                {mempool?.swapTxDetected?.toLocaleString() || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t.mempool.whaleSwaps}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-4xl font-mono font-bold text-yellow-500">
                {mempool?.largeSwapsDetected?.toLocaleString() || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t.mempool.processingTime}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-mono font-bold text-foreground">{mempool?.avgProcessingTimeMs || 0}</span>
                <span className="text-sm font-mono text-muted-foreground">ms</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 backdrop-blur border-border mt-8">
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t.mempool.processingPerformance}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono text-muted-foreground">
              <span>{t.mempool.throughput}</span>
              <span>{t.mempool.capacity}</span>
            </div>
            <Progress value={95} className="h-2 bg-muted/50 [&>div]:bg-primary" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono text-muted-foreground">
              <span>{t.mempool.nodeStability}</span>
              <span className="text-primary">{t.mempool.excellent}</span>
            </div>
            <Progress value={100} className="h-2 bg-muted/50 [&>div]:bg-primary" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
