import { useGetStrategyStats, useGetGasStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

export default function Analytics() {
  const { t, isRTL } = useLang();
  const { data: strategyStats, isLoading: stratLoading } = useGetStrategyStats();
  const { data: gasStats, isLoading: gasLoading } = useGetGasStats();

  const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

  return (
    <div className="space-y-6">
      
      {/* Top Level Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card/50 backdrop-blur border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t.analytics.currentBaseFee}</CardTitle>
          </CardHeader>
          <CardContent>
            {gasLoading ? <Skeleton className="h-10 w-32" /> : (
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-mono font-bold text-yellow-500">{gasStats?.currentGasPrice || 0}</span>
                <span className="text-sm font-mono text-muted-foreground">Gwei</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              {t.analytics.avgPrefix}: {gasStats?.avgGasPrice24h || 0} Gwei
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50 backdrop-blur border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t.analytics.totalGasBurned}</CardTitle>
          </CardHeader>
          <CardContent>
            {gasLoading ? <Skeleton className="h-10 w-32" /> : (
              <div className="text-4xl font-mono font-bold text-destructive">
                {formatCurrency(Number(gasStats?.totalGasSpentUsd || 0))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              {gasStats?.totalGasSpent || 0} {t.analytics.ethTotal}
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50 backdrop-blur border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t.analytics.avgGasPerTrade}</CardTitle>
          </CardHeader>
          <CardContent>
            {gasLoading ? <Skeleton className="h-10 w-32" /> : (
              <div className="text-4xl font-mono font-bold text-primary">
                {formatCurrency(Number(gasStats?.avgGasPerTrade || 0))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Strategy Performance (Profit) */}
        <Card className="bg-card/50 backdrop-blur border-border">
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t.analytics.profitByStrategy}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {stratLoading ? <Skeleton className="h-full w-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={strategyStats || []} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis 
                      dataKey="strategy" 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontFamily: 'monospace' }}
                      stroke="hsl(var(--border))"
                      tickFormatter={(val) => val.replace('_', ' ').toUpperCase()}
                    />
                    <YAxis 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontFamily: 'monospace' }}
                      tickFormatter={(val) => `$${val}`}
                      stroke="hsl(var(--border))"
                      orientation={isRTL ? "right" : "left"}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      itemStyle={{ fontFamily: 'monospace' }}
                      formatter={(value: any) => [formatCurrency(value), t.analytics.profit]}
                    />
                    <Bar dataKey="totalProfit" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Strategy Breakdown (Volume/Trades) */}
        <Card className="bg-card/50 backdrop-blur border-border">
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t.analytics.tradeDistribution}</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center items-center">
            <div className="h-[300px] w-full max-w-[400px]">
              {stratLoading ? <Skeleton className="h-full w-full rounded-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={strategyStats || []}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="totalTrades"
                      nameKey="strategy"
                    >
                      {(strategyStats || []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      itemStyle={{ fontFamily: 'monospace', color: '#fff' }}
                      formatter={(value: any) => [value, t.analytics.trades]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
