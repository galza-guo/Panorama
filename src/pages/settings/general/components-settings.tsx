import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettingsContext } from "@/lib/settings-provider";

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
        <CardDescription>Choose which modules are shown in the main navigation.</CardDescription>
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
