// RecoveryDialog
// Dialog shown when device sync is in RECOVERY state (device was removed)
// ======================================================================

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wealthfolio/ui/components/ui/alert-dialog";
import { Icons } from "@wealthfolio/ui";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { useState } from "react";
import { useDeviceSync } from "../providers/device-sync-provider";

interface RecoveryDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function RecoveryDialog({ open, onOpenChange }: RecoveryDialogProps) {
  const { actions } = useDeviceSync();
  const [isRecovering, setIsRecovering] = useState(false);

  const handleRecovery = async () => {
    setIsRecovering(true);
    try {
      await actions.handleRecovery();
      onOpenChange?.(false);
    } catch {
      // Error handling is done by the provider
    } finally {
      setIsRecovering(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mb-2 flex items-center gap-2">
            <Icons.AlertTriangle className="h-5 w-5 text-amber-500" />
            <AlertDialogTitle>Set Up This Device Again</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            Sync was turned off for this device. Set it up again to keep your data up to date
            across your devices.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange?.(false)} disabled={isRecovering}>
            Not now
          </Button>
          <AlertDialogAction onClick={handleRecovery} disabled={isRecovering}>
            {isRecovering ? (
              <>
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                Setting up...
              </>
            ) : (
              "Set Up This Device Again"
            )}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
