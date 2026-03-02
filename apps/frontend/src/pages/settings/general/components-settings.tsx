import { useSettingsContext } from "@/lib/settings-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { Switch } from "@wealthfolio/ui/components/ui/switch";

export function ComponentsSettings() {
  const { settings, updateSettings } = useSettingsContext();

  if (!settings) {
    return null;
  }

  const handleInsuranceToggle = (enabled: boolean) => {
    updateSettings({ insuranceVisible: enabled }).catch((error) => {
      console.error("Failed to update Insurance visibility:", error);
    });
  };

  const handleMpfToggle = (enabled: boolean) => {
    updateSettings({ mpfVisible: enabled }).catch((error) => {
      console.error("Failed to update MPF visibility:", error);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Components</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="component-insurance" className="text-base">
              Insurance
            </Label>
            <p className="text-muted-foreground text-xs">Show the Insurance module in the app.</p>
          </div>
          <Switch
            id="component-insurance"
            checked={settings.insuranceVisible ?? true}
            onCheckedChange={handleInsuranceToggle}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="component-mpf" className="text-base">
              MPF
            </Label>
            <p className="text-muted-foreground text-xs">Show the MPF module in the app.</p>
          </div>
          <Switch
            id="component-mpf"
            checked={settings.mpfVisible ?? true}
            onCheckedChange={handleMpfToggle}
          />
        </div>
      </CardContent>
    </Card>
  );
}
