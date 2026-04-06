import { 
  useGetAnalyticsSummary, 
  useGetLiveOpportunities,
  useGetPnlHistory
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import { ArrowUpRight, Zap, Target, Activity, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

export default function Dashboard() {
  const { t, isRTL } = useLang();
  const { data: analytics, isLoading: analyticsLoading } = useGetAnalyticsSummary();
  const { data: liveOps, isLoading: liveLoading } = useGetLiveOpportunities({
    query: { refetchInterval: 2000 }
  });
  const { data: pnlHistory, isLoading: pnlLoading } = useGetPnlHistory({ period: '24h' });

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card/50 backdrop-blur border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.dashboard.totalProfit}</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {analyticsLoading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-3xl font-mono font-bold text-primary">
                {formatCurrency(Number(analytics?.totalProfit || 0))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              +{formatCurrency(Number(analytics?.profitToday || 0))} {t.dashboard.today}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.dashboard.successRate}</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {analyticsLoading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-3xl font-mono font-bold">
                {analytics?.successRate || "0%"}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {analytics?.successfulTrades || 0} {t.dashboard.successfulTrades}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.dashboard.totalGasSpent}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {analyticsLoading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-3xl font-mono font-bold text-yellow-500">
                {formatCurrency(Number(analytics?.totalGasSpent || 0))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {t.dashboard.avg} {formatCurrency(Number(analytics?.avgProfitPerTrade || 0))} {t.dashboard.avgProfitPerTrade}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.dashboard.opsDetected}</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {analyticsLoading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-3xl font-mono font-bold">
                {analytics?.opportunitiesDetected?.toLocaleString() || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {analytics?.executionRate || "0%"} {t.dashboard.executionRate}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* PnL Chart */}
        <Card className="lg:col-span-2 bg-card/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t.dashboard.cumulativePnl}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {pnlLoading ? <Skeleton className="h-full w-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={pnlHistory || []}>
                    <defs>
                      <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis 
                      dataKey="timestamp" 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      tickFormatter={(val) => new Date(val).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      stroke="hsl(var(--border))"
                    />
                    <YAxis 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontFamily: 'monospace' }}
                      tickFormatter={(val) => `$${val}`}
                      stroke="hsl(var(--border))"
                      width={80}
                      orientation={isRTL ? "right" : "left"}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      itemStyle={{ color: 'hsl(var(--primary))', fontFamily: 'monospace' }}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                      formatter={(value: any) => [formatCurrency(value), "PnL"]}
                      labelFormatter={(label) => new Date(label).toLocaleString()}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="cumulativePnl" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorPnl)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Live Opportunities Feed */}
        <Card className="bg-card/50 backdrop-blur flex flex-col">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-sm font-medium uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-yellow-500 pulse-glow" />
              {t.dashboard.liveRadar}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto">
            <div className="divide-y divide-border">
              {liveLoading ? (
                Array.from({length: 5}).map((_, i) => (
                  <div key={i} className="p-4 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                ))
              ) : liveOps?.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  {t.dashboard.scanningMempool}
                </div>
              ) : (
                liveOps?.slice(0, 8).map((op) => (
                  <div key={op.id} className="p-4 hover:bg-accent/50 transition-colors flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] uppercase font-mono border-primary/30 text-primary bg-primary/10">
                          {op.strategy.replace('_', ' ')}
                        </Badge>
                        <span className="font-mono text-sm font-bold">{op.tokenPair}</span>
                      </div>
                      <span className={`font-mono text-sm font-bold ${Number(op.netProfit) > 0 ? 'text-primary' : 'text-destructive'}`}>
                        {formatCurrency(Number(op.netProfit))}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <span>{op.buyDex}</span>
                        <ArrowUpRight className="h-3 w-3" />
                        <span>{op.sellDex}</span>
                      </div>
                      <div className="font-mono">
                        {new Date(op.detectedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
