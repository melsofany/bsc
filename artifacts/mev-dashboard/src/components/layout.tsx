import { Link, useLocation } from "wouter";
import { 
  Activity, 
  BarChart2, 
  Settings, 
  List, 
  Briefcase, 
  Zap,
  Power,
  Server,
  Languages
} from "lucide-react";
import { useGetBotStatus, useStartBot, useStopBot, getGetBotStatusQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { useLang } from "@/lib/i18n";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { t, lang, setLang, isRTL } = useLang();
  
  const { data: botStatus } = useGetBotStatus({
    query: { refetchInterval: 3000 }
  });
  
  const startBot = useStartBot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
      }
    }
  });
  
  const stopBot = useStopBot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
      }
    }
  });

  const isRunning = botStatus?.running;

  const navItems = [
    { href: "/", label: t.nav.dashboard, icon: Activity },
    { href: "/opportunities", label: t.nav.opportunities, icon: Zap },
    { href: "/trades", label: t.nav.trades, icon: Briefcase },
    { href: "/analytics", label: t.nav.analytics, icon: BarChart2 },
    { href: "/mempool", label: t.nav.mempool, icon: List },
    { href: "/settings", label: t.nav.settings, icon: Settings },
  ];

  const currentLabel = navItems.find(i => i.href === location)?.label || t.nav.dashboard;

  return (
    <div className={`min-h-[100dvh] flex flex-col bg-background text-foreground dark`} dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex flex-col md:flex-row flex-1">
        {/* Sidebar */}
        <aside className={`w-full md:w-64 border-border bg-sidebar flex flex-col flex-shrink-0 ${isRTL ? "md:border-l" : "md:border-r"}`}>
          <div className="h-16 flex items-center px-6 border-b border-border">
            <div className="flex items-center gap-2 text-primary font-bold text-xl tracking-wider">
              <Server className="h-5 w-5" />
              <span>MEV ALPHA</span>
            </div>
          </div>
          
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                    isActive 
                      ? "bg-primary/10 text-primary font-medium" 
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-border mt-auto">
            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">{t.layout.systemStatus}</div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${isRunning ? 'bg-primary pulse-glow' : 'bg-destructive'}`} />
                  <span className="text-sm font-medium">{isRunning ? t.layout.active : t.layout.standby}</span>
                </div>
                {botStatus?.mode && (
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {botStatus.mode}
                  </Badge>
                )}
              </div>
            </div>
            
            <Button 
              className="w-full font-bold tracking-widest uppercase text-xs"
              variant={isRunning ? "destructive" : "default"}
              onClick={() => isRunning ? stopBot.mutate() : startBot.mutate()}
              disabled={startBot.isPending || stopBot.isPending}
            >
              <Power className={`h-4 w-4 ${isRTL ? "ml-2" : "mr-2"}`} />
              {isRunning ? t.layout.stopBot : t.layout.initialize}
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-16 border-b border-border flex items-center justify-between px-6 flex-shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-semibold capitalize">
                {currentLabel}
              </h1>
            </div>
            
            <div className="flex items-center gap-4 text-sm">
              {botStatus && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t.layout.network}:</span>
                    <span className="font-mono text-primary uppercase">{botStatus.network}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t.layout.gas}:</span>
                    <span className="font-mono text-yellow-500">{botStatus.gasPrice} Gwei</span>
                  </div>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLang(lang === "ar" ? "en" : "ar")}
                className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground"
              >
                <Languages className="h-4 w-4" />
                {lang === "ar" ? "EN" : "عربي"}
              </Button>
            </div>
          </header>
          
          <div className="flex-1 overflow-auto p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
