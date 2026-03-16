import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import { useSettingsContext } from "@/lib/settings-provider";

export function ConnectVisibilitySettings() {
  const { settings, updateSettings } = useSettingsContext();

  if (!settings) {
    return null;
  }

  const handleToggle = async (visible: boolean) => {
    await updateSettings({ wealthfolioConnectVisible: visible });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Wealthfolio Connect</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="wealthfolio-connect-visible" className="text-base">
              Show Wealthfolio Connect
            </Label>
            <p className="text-muted-foreground text-xs">
              Controls whether Wealthfolio Connect appears in the sidebar and Settings.
            </p>
          </div>
          <Switch
            id="wealthfolio-connect-visible"
            aria-label="Show Wealthfolio Connect"
            checked={settings.wealthfolioConnectVisible}
            onCheckedChange={(checked) => void handleToggle(checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
