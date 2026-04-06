import { useGetConfig, useUpdateConfig, getGetConfigQueryKey, useGetWalletStatus, useConnectWallet, useDisconnectWallet, getGetWalletStatusQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Save, AlertTriangle, Wallet, CheckCircle2, XCircle, Shield, Unplug, Link } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLang } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";

const formSchema = z.object({
  network: z.enum(["ethereum", "polygon", "bsc", "arbitrum", "bsc_testnet"]),
  mode: z.enum(["simulation", "live"]),
  minProfitThresholdUsd: z.string().min(1),
  maxGasPriceGwei: z.string().min(1),
  slippageTolerance: z.string().optional(),
  flashbotsEnabled: z.boolean(),
  flashLoanEnabled: z.boolean(),
  flashLoanProvider: z.enum(["pancakeswap", "pancakeswap_v3", "uniswap_v3"]).optional(),
});

export default function Settings() {
  const { toast } = useToast();
  const { t, isRTL } = useLang();
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useGetConfig();
  const { data: walletStatus, isLoading: walletLoading } = useGetWalletStatus({ refetchInterval: 30000 });

  const [privateKey, setPrivateKey] = useState("");
  const [contractAddr, setContractAddr] = useState("");

  const updateConfig = useUpdateConfig({
    mutation: {
      onSuccess: () => {
        toast({ title: t.settings.saved, description: t.settings.savedDesc });
        queryClient.invalidateQueries({ queryKey: getGetConfigQueryKey() });
      },
      onError: () => {
        toast({ title: t.settings.error, description: t.settings.errorDesc, variant: "destructive" });
      },
    },
  });

  const connectWallet = useConnectWallet({
    mutation: {
      onSuccess: (data) => {
        toast({ title: t.settings.walletConnected, description: t.settings.walletConnectedDesc });
        queryClient.invalidateQueries({ queryKey: getGetWalletStatusQueryKey() });
        setPrivateKey("");
        if (data.contractAddress) setContractAddr(data.contractAddress);
      },
      onError: (err: any) => {
        toast({
          title: t.settings.error,
          description: err?.message ?? "Failed to connect wallet",
          variant: "destructive",
        });
      },
    },
  });

  const disconnectWallet = useDisconnectWallet({
    mutation: {
      onSuccess: () => {
        toast({ title: t.settings.walletDisconnected, description: t.settings.walletDisconnectedDesc });
        queryClient.invalidateQueries({ queryKey: getGetWalletStatusQueryKey() });
      },
    },
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      network: "bsc",
      mode: "simulation",
      minProfitThresholdUsd: "10.00",
      maxGasPriceGwei: "150",
      slippageTolerance: "0.5",
      flashbotsEnabled: false,
      flashLoanEnabled: false,
      flashLoanProvider: "pancakeswap",
    },
  });

  useEffect(() => {
    if (config) {
      form.reset({
        network: config.network,
        mode: config.mode,
        minProfitThresholdUsd: config.minProfitThresholdUsd,
        maxGasPriceGwei: config.maxGasPriceGwei,
        slippageTolerance: config.slippageTolerance || "0.5",
        flashbotsEnabled: config.flashbotsEnabled,
        flashLoanEnabled: config.flashLoanEnabled,
        flashLoanProvider: config.flashLoanProvider || "pancakeswap",
      });
      if (config.contractAddress && !contractAddr) {
        setContractAddr(config.contractAddress);
      }
    }
  }, [config, form]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    updateConfig.mutate({ data: values });
  }

  function handleConnect() {
    if (!privateKey.trim()) return;
    const selectedNetwork = form.getValues("network");
    connectWallet.mutate({
      data: {
        privateKey: privateKey.trim(),
        contractAddress: contractAddr.trim() || undefined,
        network: selectedNetwork,
      },
    });
  }

  function handleDisconnect() {
    disconnectWallet.mutate({});
  }

  const isConnected = walletStatus?.connected === true;

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-[500px] w-full" /></div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">{t.settings.botConfiguration}</h2>
      </div>

      {/* ─── Wallet & Smart Contract ─── */}
      <Card className="bg-card/50 backdrop-blur border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <CardTitle className="uppercase tracking-wider text-sm text-muted-foreground">
              {t.settings.walletSection}
            </CardTitle>
          </div>
          <CardDescription className="text-xs">{t.settings.walletSectionDesc}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Status Banner */}
          {walletLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : isConnected ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-primary">{t.settings.walletConnected}</span>
                <Badge variant="outline" className="text-[10px] border-primary/40 text-primary ml-auto">
                  {walletStatus.network}
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <span className="text-muted-foreground">{t.settings.address}: </span>
                  <span className="text-foreground break-all">{walletStatus.address}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t.settings.balance}: </span>
                  <span className="text-primary font-bold">{walletStatus.balance} ETH</span>
                </div>
              </div>
              {walletStatus.contractAddress && (
                <div className="mt-1 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-mono">
                    {walletStatus.contractValid ? (
                      <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                    ) : (
                      <XCircle className="h-3 w-3 text-destructive shrink-0" />
                    )}
                    <span className="text-muted-foreground">Contract: </span>
                    <span className={walletStatus.contractValid ? "text-green-400" : "text-destructive"}>
                      {walletStatus.contractAddress?.slice(0, 20)}...
                    </span>
                    {walletStatus.contractValid && (
                      <Badge variant="outline" className="text-[9px] text-green-400 border-green-400/30">
                        {t.settings.contractValid}
                      </Badge>
                    )}
                  </div>
                  {!walletStatus.contractValid && (walletStatus as any).contractError && (
                    <p className="text-[10px] text-destructive/80 pl-5">
                      {(walletStatus as any).contractError}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/20 p-4 flex items-center gap-3 text-muted-foreground text-sm">
              <XCircle className="h-4 w-4 shrink-0" />
              <span>No wallet connected — running in simulation mode only</span>
            </div>
          )}

          {/* Security Warning */}
          <div className="flex items-start gap-2 text-xs text-yellow-500/80 bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
            <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{t.settings.securityWarning}</span>
          </div>

          {/* Input Fields */}
          {!isConnected && (
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t.settings.privateKey}</label>
                <Input
                  type="password"
                  placeholder={t.settings.privateKeyPlaceholder}
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">{t.settings.privateKeyDesc}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t.settings.contractAddress}</label>
                <Input
                  type="text"
                  placeholder={t.settings.contractAddressPlaceholder}
                  value={contractAddr}
                  onChange={(e) => setContractAddr(e.target.value)}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">{t.settings.contractAddressDesc}</p>
                <p className="text-xs text-blue-400/70 flex items-center gap-1">
                  <Link className="h-3 w-3" />
                  {t.settings.deployHint}
                </p>
              </div>
            </div>
          )}

          {/* Connect / Disconnect */}
          {isConnected ? (
            <Button
              variant="outline"
              onClick={handleDisconnect}
              disabled={disconnectWallet.isPending}
              className="border-destructive/50 text-destructive hover:bg-destructive/10 font-bold tracking-wider"
            >
              <Unplug className={`h-4 w-4 ${isRTL ? "ml-2" : "mr-2"}`} />
              {t.settings.disconnect}
            </Button>
          ) : (
            <Button
              onClick={handleConnect}
              disabled={!privateKey.trim() || connectWallet.isPending}
              className="font-bold tracking-wider"
            >
              <Wallet className={`h-4 w-4 ${isRTL ? "ml-2" : "mr-2"}`} />
              {connectWallet.isPending ? t.settings.connecting : t.settings.connect}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ─── Bot Config Form ─── */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="bg-card/50 backdrop-blur border-border">
            <CardHeader>
              <CardTitle className="uppercase tracking-wider text-sm text-muted-foreground">{t.settings.coreParams}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">

              <FormField
                control={form.control}
                name="network"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.settings.network}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="font-mono">
                          <SelectValue placeholder={t.settings.selectNetwork} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ethereum">{t.networks.ethereum}</SelectItem>
                        <SelectItem value="arbitrum">{t.networks.arbitrum}</SelectItem>
                        <SelectItem value="polygon">{t.networks.polygon}</SelectItem>
                        <SelectItem value="bsc">{t.networks.bsc}</SelectItem>
                        <SelectItem value="bsc_testnet">{t.networks.bsc_testnet}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.settings.executionMode}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className={`font-mono ${field.value === 'live' ? 'text-destructive border-destructive font-bold' : ''}`}>
                          <SelectValue placeholder={t.settings.selectMode} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="simulation">{t.settings.simulationSafe}</SelectItem>
                        <SelectItem value="live" className="text-destructive font-bold">{t.settings.liveDanger}</SelectItem>
                      </SelectContent>
                    </Select>
                    {field.value === 'live' && (
                      <FormDescription className="text-destructive flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3" /> {t.settings.realFundsWarning}
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="minProfitThresholdUsd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.settings.minProfit}</FormLabel>
                    <FormControl>
                      <Input placeholder="10.00" {...field} className="font-mono" />
                    </FormControl>
                    <FormDescription>{t.settings.minProfitDesc}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxGasPriceGwei"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.settings.maxGas}</FormLabel>
                    <FormControl>
                      <Input placeholder="150" {...field} className="font-mono" />
                    </FormControl>
                    <FormDescription>{t.settings.maxGasDesc}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slippageTolerance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.settings.slippage}</FormLabel>
                    <FormControl>
                      <Input placeholder="0.5" {...field} className="font-mono" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-border">
            <CardHeader>
              <CardTitle className="uppercase tracking-wider text-sm text-muted-foreground">{t.settings.advancedTactics}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">

              <FormField
                control={form.control}
                name="flashbotsEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4 bg-background/50">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">{t.settings.flashbotsTitle}</FormLabel>
                      <FormDescription>{t.settings.flashbotsDesc}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="flashLoanEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4 bg-background/50">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">{t.settings.flashLoanTitle}</FormLabel>
                      <FormDescription>{t.settings.flashLoanDesc}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              {form.watch("flashLoanEnabled") && (
                <FormField
                  control={form.control}
                  name="flashLoanProvider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.settings.flashLoanProvider}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="font-mono max-w-sm">
                            <SelectValue placeholder={t.settings.selectProvider} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pancakeswap">PancakeSwap V2 Flash</SelectItem>
                          <SelectItem value="pancakeswap_v3">PancakeSwap V3</SelectItem>
                          <SelectItem value="uniswap_v3">Uniswap V3</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

            </CardContent>
            <CardFooter className="flex justify-end pt-6">
              <Button type="submit" disabled={updateConfig.isPending} className="font-bold tracking-wider">
                <Save className={`h-4 w-4 ${isRTL ? "ml-2" : "mr-2"}`} />
                {updateConfig.isPending ? t.settings.saving : t.settings.save}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
