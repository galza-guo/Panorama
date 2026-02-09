import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Icons } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ExchangeRateProvider } from "@/lib/constants";
import { useSettingsContext } from "@/lib/settings-provider";
import { ExchangeRate } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { useMarketDataProviderSettings } from "@/pages/settings/market-data/use-market-data-settings";
import { ColumnDef } from "@tanstack/react-table";
import { ActionConfirm } from "@wealthfolio/ui";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AddExchangeRateForm } from "./add-exchange-rate-form";
import { RateCell } from "./rate-cell";
import { useExchangeRates } from "./use-exchange-rate";

export function ExchangeRatesSettings() {
  const {
    exchangeRates,
    isLoadingRates,
    updateExchangeRate,
    addExchangeRate,
    deleteExchangeRate,
    isDeletingRate,
  } = useExchangeRates();
  const { settings, updateSettings } = useSettingsContext();
  const { data: providerSettings } = useMarketDataProviderSettings();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const isOpenExchangeRatesEnabled = !!providerSettings?.find(
    (provider) => provider.id === ExchangeRateProvider.OPEN_EXCHANGE_RATES && provider.enabled,
  );
  const selectedProvider =
    settings?.exchangeRateProvider?.toUpperCase() ?? ExchangeRateProvider.YAHOO;
  const isAutomaticExchangeEnabled = settings?.handleExchangeAutomatically ?? true;

  const handleAutomaticExchangeToggle = (enabled: boolean) => {
    if (!settings) {
      return;
    }
    void updateSettings({
      handleExchangeAutomatically: enabled,
      exchangeRateProvider:
        selectedProvider === ExchangeRateProvider.OPEN_EXCHANGE_RATES &&
        !isOpenExchangeRatesEnabled
          ? ExchangeRateProvider.YAHOO
          : selectedProvider,
    });
  };

  const handleProviderChange = (provider: string) => {
    if (!settings) {
      return;
    }
    void updateSettings({ exchangeRateProvider: provider });
  };

  const columns: ColumnDef<ExchangeRate>[] = [
    {
      accessorKey: "fromCurrency",
      header: "From",
      enableHiding: false,
      cell: ({ row }) => (
        <div>
          <div>{row.original.fromCurrency}</div>
          <div className="text-muted-foreground text-xs">{row.original.fromCurrencyName}</div>
        </div>
      ),
    },
    {
      accessorKey: "toCurrency",
      header: "To",
      enableHiding: false,
      cell: ({ row }) => (
        <div>
          <div>{row.original.toCurrency}</div>
          <div className="text-muted-foreground text-xs">{row.original.toCurrencyName}</div>
        </div>
      ),
    },
    {
      accessorKey: "source",
      header: "Source",
      enableHiding: false,
    },
    {
      accessorKey: "rate",
      header: "Rate",
      enableHiding: false,
      cell: ({ row }) => <RateCell rate={row.original} onUpdate={updateExchangeRate} />,
      size: 180,
    },
    {
      accessorKey: "updatedAt",
      header: "Last Updated",
      enableHiding: false,
      cell: ({ row }) => (
        <div className="text-muted-foreground text-sm">{formatDate(row.original.timestamp)}</div>
      ),
    },
    {
      id: "history",
      enableHiding: false,
      cell: ({ row }) => (
        <Link
          to={`/holdings/${encodeURIComponent(row.original.id)}`}
          className="flex items-center justify-center"
        >
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Icons.Clock className="h-4 w-4" />
            <span className="sr-only">View history</span>
          </Button>
        </Link>
      ),
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const rate = row.original;
        const currencyPair = `${rate.fromCurrency}/${rate.toCurrency}`;

        return (
          <ActionConfirm
            confirmTitle="Delete Exchange Rate"
            confirmMessage={
              <>
                <p className="mb-2">
                  Are you sure you want to delete the <strong>{currencyPair}</strong> exchange rate?
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  <Icons.AlertTriangle className="mr-1 inline h-3 w-3" />
                  If you have holdings or transactions in {rate.fromCurrency}, you may need to
                  recreate this exchange rate for accurate portfolio calculations.
                </p>
              </>
            }
            handleConfirm={() => deleteExchangeRate(rate.id)}
            isPending={isDeletingRate}
            confirmButtonText="Delete"
            confirmButtonVariant="destructive"
            button={
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Icons.Trash className="h-4 w-4" />
                <span className="sr-only">Delete</span>
              </Button>
            }
          />
        );
      },
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Exchange Rates</CardTitle>
            <CardDescription>
              Manage exchange rates for currencies in your portfolio.
            </CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Icons.PlusCircle className="mr-2 h-4 w-4" />
                Add rate
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <AddExchangeRateForm
                onSubmit={(newRate) => {
                  addExchangeRate(newRate);
                  setIsAddDialogOpen(false);
                }}
                onCancel={() => setIsAddDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6 space-y-4 rounded-md border p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="handle-exchange-automatically" className="text-base">
                Handle exchange automatically
              </Label>
              <p className="text-muted-foreground text-xs">
                Automatically manage exchange rates for currency conversion workflows.
              </p>
            </div>
            <Switch
              id="handle-exchange-automatically"
              checked={isAutomaticExchangeEnabled}
              onCheckedChange={handleAutomaticExchangeToggle}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="exchange-rate-provider">Automatic exchange provider</Label>
            <Select
              value={
                selectedProvider === ExchangeRateProvider.OPEN_EXCHANGE_RATES &&
                !isOpenExchangeRatesEnabled
                  ? ExchangeRateProvider.YAHOO
                  : selectedProvider
              }
              onValueChange={handleProviderChange}
              disabled={!isAutomaticExchangeEnabled}
            >
              <SelectTrigger id="exchange-rate-provider" className="w-full sm:w-72">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ExchangeRateProvider.YAHOO}>Yahoo Finance</SelectItem>
                {isOpenExchangeRatesEnabled && (
                  <SelectItem value={ExchangeRateProvider.OPEN_EXCHANGE_RATES}>
                    Open Exchange Rates
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {!isOpenExchangeRatesEnabled && (
              <p className="text-muted-foreground text-xs">
                Enable and validate Open Exchange Rates in Market Data settings to use it here.
              </p>
            )}
          </div>
        </div>

        {isLoadingRates ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : exchangeRates && exchangeRates.length > 0 ? (
          <DataTable columns={columns} data={exchangeRates} />
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Icons.DollarSign className="text-muted-foreground h-12 w-12" />
            <h3 className="mt-4 text-lg font-semibold">No exchange rates defined yet</h3>

            <Button className="mt-4" onClick={() => setIsAddDialogOpen(true)}>
              <Icons.PlusCircle className="mr-2 h-4 w-4" />
              Add rate
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
