import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import { usePlatform } from "@/hooks/use-platform";
import { useSettingsContext } from "@/lib/settings-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { SettingsHeader } from "../settings-header";
import { AutoUpdateSettings } from "./auto-update-settings";
import { BaseCurrencySettings } from "./currency-settings";
import { ExchangeRatesSettings } from "./exchange-rates/exchange-rates-settings";

export default function GeneralSettingsPage() {
  const { isMobile } = usePlatform();
  const { settings, updateSettings } = useSettingsContext();

  const handleBucketsToggle = (enabled: boolean) => {
    updateSettings({ bucketsEnabled: enabled }).catch((error) => {
      console.error("Failed to update buckets setting:", error);
    });
  };

  return (
    <div className="space-y-6">
      <SettingsHeader
        heading="General"
        text="Manage the general application settings and preferences."
      />
      <Separator />
      <BaseCurrencySettings />
      <div className="pt-6">
        <ExchangeRatesSettings />
      </div>
      <div className="pt-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Buckets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="buckets-enabled" className="text-base">
                  Enable buckets
                </Label>
                <p className="text-muted-foreground text-xs">
                  Turn on the Buckets module and reveal bucket labels and insights.
                </p>
              </div>
              <Switch
                id="buckets-enabled"
                checked={settings?.bucketsEnabled ?? false}
                onCheckedChange={handleBucketsToggle}
              />
            </div>
          </CardContent>
        </Card>
      </div>
      {!isMobile && (
        <div className="pt-6">
          <AutoUpdateSettings />
        </div>
      )}
    </div>
  );
}
