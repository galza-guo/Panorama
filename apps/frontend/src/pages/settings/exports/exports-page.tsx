import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui/components/ui/tabs";
import { FolderSyncCard } from "@/features/folder-sync/components/folder-sync-card";
import { SettingsHeader } from "../settings-header";
import { BackupRestoreForm } from "./backup-restore-form";
import { ExportForm } from "./exports-form";

const ExportSettingsPage = () => {
  return (
    <div className="space-y-6">
      <SettingsHeader
        heading="Backup, Sync & Export"
        text="Manage database backups, shared-folder sync, and data exports."
      />
      <Separator />

      <Tabs defaultValue="backup" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="backup">Backup & Restore</TabsTrigger>
          <TabsTrigger value="sync">Sync</TabsTrigger>
          <TabsTrigger value="export">Data Export</TabsTrigger>
        </TabsList>

        <TabsContent value="backup" className="mt-6">
          <BackupRestoreForm />
        </TabsContent>

        <TabsContent value="sync" className="mt-6">
          <FolderSyncCard />
        </TabsContent>

        <TabsContent value="export" className="mt-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Data Export</h3>
              <p className="text-muted-foreground text-sm">
                Export specific data types in various formats for analysis or external use.
              </p>
            </div>
            <ExportForm />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ExportSettingsPage;
