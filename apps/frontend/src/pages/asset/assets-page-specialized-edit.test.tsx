import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { AlternativeAssetHolding, Asset } from "@/lib/types";
import type { ParsedAsset } from "./asset-utils";

const insuranceAsset = {
  id: "ALT-INS-1",
  name: "Chubb",
  displayCode: "Insurance",
  description: null,
  kind: "INSURANCE",
  quoteCcy: "HKD",
  quoteSource: null,
  quoteMode: "MANUAL",
  metadata: {
    panorama_category: "insurance",
    sub_type: "insurance",
    insurance_provider: "Chubb",
  },
  isActive: true,
  createdAt: "2026-02-20T00:00:00Z",
  updatedAt: "2026-02-20T00:00:00Z",
} as Asset;

const insuranceHolding = {
  id: "ALT-INS-1",
  symbol: "ALT-INS-1",
  name: "Chubb",
  kind: "insurance",
  currency: "HKD",
  marketValue: "125000",
  valuationDate: "2026-02-20T00:00:00Z",
  metadata: {
    panorama_category: "insurance",
    sub_type: "insurance",
    insurance_provider: "Chubb",
  },
  notes: "Policy notes",
} as AlternativeAssetHolding;

vi.mock("@/hooks/use-alternative-assets", () => ({
  useAlternativeHoldings: () => ({ data: [insuranceHolding] }),
}));

vi.mock("@/hooks/use-platform", () => ({
  useIsMobileViewport: () => false,
}));

vi.mock("@/hooks/use-sync-market-data", () => ({
  useSyncMarketDataMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/adapters", () => ({
  syncPanoramaMpfUnitPrices: vi.fn(),
}));

vi.mock("../settings/settings-header", () => ({
  SettingsHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("./hooks/use-assets", () => ({
  useAssets: () => ({ assets: [insuranceAsset], isLoading: false }),
}));

vi.mock("./hooks/use-latest-quotes", () => ({
  useLatestQuotes: () => ({ data: {}, isLoading: false }),
}));

vi.mock("./hooks/use-asset-management", () => ({
  useAssetManagement: () => ({
    deleteAssetMutation: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock("./alternative-assets/hooks", () => ({
  useAlternativeAssetMutations: () => ({
    createMutation: { mutateAsync: vi.fn(), isPending: false },
    updateMetadataMutation: { mutateAsync: vi.fn(), isPending: false },
    updateValuationMutation: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock("./assets-table", () => ({
  AssetsTable: ({
    assets,
    onEdit,
  }: {
    assets: ParsedAsset[];
    onEdit: (asset: ParsedAsset) => void;
  }) => (
    <div>
      {assets.map((asset) => (
        <button key={asset.id} type="button" onClick={() => onEdit(asset)}>
          Edit {asset.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("./assets-table-mobile", () => ({
  AssetsTableMobile: () => null,
}));

vi.mock("./asset-edit-sheet", () => ({
  AssetEditSheet: ({ open }: { open: boolean }) =>
    open ? <div>Generic Asset Edit Sheet</div> : null,
}));

vi.mock("./refresh-quotes-confirm-dialog", () => ({
  RefreshQuotesConfirmDialog: () => null,
}));

vi.mock("@/pages/mpf/components/mpf-asset-editor-sheet", () => ({
  MpfAssetEditorSheet: () => null,
}));

vi.mock("@/pages/time-deposits/components/time-deposit-editor-sheet", () => ({
  TimeDepositEditorSheet: () => null,
}));

vi.mock("@/pages/insurance/components/insurance-policy-editor-sheet", () => ({
  InsurancePolicyEditorSheet: ({ open, mode }: { open: boolean; mode: "create" | "edit" }) =>
    open ? <div>{mode === "edit" ? "Edit Insurance Policy" : "Add Insurance Policy"}</div> : null,
}));

import AssetsPage from "./assets-page";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AssetsPage />
    </QueryClientProvider>,
  );
}

describe("assets page specialized asset editors", () => {
  it("opens the insurance policy editor for insurance assets", async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByRole("button", { name: "Edit Chubb" }));

    expect(screen.getByText("Edit Insurance Policy")).toBeInTheDocument();
    expect(screen.queryByText("Generic Asset Edit Sheet")).not.toBeInTheDocument();
  });
});
