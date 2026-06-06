import { Dialog, DialogContent } from "@panorama/ui/components/ui/dialog";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { useSettingsContext } from "@/lib/settings-provider";
import type { Account } from "@/lib/types";
import { AccountForm } from "./account-form";

export interface AccountEditModalProps {
  account?: Account;
  accounts?: Account[];
  open?: boolean;
  onClose?: () => void;
}

export function AccountEditModal({ account, accounts = [], open, onClose }: AccountEditModalProps) {
  const { settings } = useSettingsContext();

  const defaultValues = {
    id: account?.id ?? undefined,
    name: account?.name ?? "",
    balance: account?.balance ?? 0,
    accountType: (account?.accountType ?? "SECURITIES") as "SECURITIES" | "CASH" | "CRYPTOCURRENCY",
    group: account?.group ?? undefined,
    currency: account?.currency ?? settings?.baseCurrency ?? "USD",
    isDefault: account?.isDefault ?? false,
    isActive: account?.id ? account?.isActive : true,
    isArchived: account?.isArchived ?? false,
    trackingMode: account?.trackingMode,
    meta: account?.meta,
    accountOwner: account?.accountOwner ?? null,
  };

  return (
    <Dialog open={open} onOpenChange={onClose} useIsMobile={useIsMobileViewport}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[625px]">
        <AccountForm accounts={accounts} defaultValues={defaultValues} onSuccess={onClose} />
      </DialogContent>
    </Dialog>
  );
}
