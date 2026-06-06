import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { AlternativeAssetHolding } from "@/lib/types";

const insuranceHolding: AlternativeAssetHolding = {
  id: "ALT-INS-1",
  symbol: "ALT-INS-1",
  name: "Chubb",
  kind: "insurance",
  currency: "HKD",
  marketValue: "125000",
  purchasePrice: undefined,
  purchaseDate: undefined,
  unrealizedGain: undefined,
  unrealizedGainPct: undefined,
  valuationDate: "2026-02-20T00:00:00Z",
  metadata: {
    panorama_category: "insurance",
    sub_type: "insurance",
    insurance_provider: "Chubb",
    policy_type: "Whole life",
    valuation_date: "2026-02-20",
  },
  linkedAssetId: undefined,
  notes: "Policy notes",
};

vi.mock("@/components/page", () => ({
  SwipablePage: ({ views }: { views: { value: string; content: ReactNode }[] }) => (
    <div>{views.find((view) => view.value === "assets")?.content}</div>
  ),
}));

vi.mock("@/components/account-selector", () => ({
  AccountSelector: () => null,
}));

vi.mock("@/components/action-palette", () => ({
  ActionPalette: () => null,
}));

vi.mock("@/hooks/use-accounts", () => ({
  useAccounts: () => ({ accounts: [], isLoading: false }),
}));

vi.mock("@/hooks/use-holdings", () => ({
  useHoldings: () => ({ holdings: [], isLoading: false }),
}));

vi.mock("@/hooks/use-alternative-assets", () => ({
  useAlternativeHoldings: () => ({ data: [insuranceHolding], isLoading: false }),
  useDeleteAlternativeAsset: () => ({ mutate: vi.fn(), isPending: false }),
  useLinkLiability: () => ({ mutateAsync: vi.fn() }),
  useUnlinkLiability: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/use-persistent-state", () => ({
  usePersistentState: <T,>(_key: string, initialValue: T) => useState(initialValue),
}));

vi.mock("@/hooks/use-platform", () => ({
  useIsMobileViewport: () => false,
}));

vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: () => ({ settings: { baseCurrency: "HKD" } }),
}));

vi.mock("@/hooks/use-calculate-portfolio", () => ({
  useUpdatePortfolioMutation: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/adapters", () => ({
  reEnrichAssetProfiles: vi.fn(),
  updateAlternativeAssetMetadata: vi.fn(),
  updateAlternativeAssetValuation: vi.fn(),
}));

vi.mock("@/components/classification/classification-sheet", () => ({
  ClassificationSheet: () => null,
}));

vi.mock("./components/holdings-mobile-filter-sheet", () => ({
  HoldingsMobileFilterSheet: () => null,
}));

vi.mock("./components/holdings-table", () => ({
  HoldingsTable: () => null,
}));

vi.mock("./components/holdings-table-mobile", () => ({
  HoldingsTableMobile: () => null,
}));

vi.mock("./components/holdings-edit-mode", () => ({
  HoldingsEditMode: () => null,
}));

vi.mock("./components/alternative-holdings-table", () => ({
  AlternativeHoldingsTable: ({
    holdings,
    onEdit,
  }: {
    holdings: AlternativeAssetHolding[];
    onEdit: (holding: AlternativeAssetHolding) => void;
  }) => (
    <div>
      {holdings.map((holding) => (
        <button key={holding.id} type="button" onClick={() => onEdit(holding)}>
          Edit {holding.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("./components/alternative-holdings-list-mobile", () => ({
  AlternativeHoldingsListMobile: () => null,
}));

vi.mock("@/pages/asset/alternative-assets", () => ({
  AlternativeAssetQuickAddModal: () => null,
  AssetDetailsSheet: ({ open }: { open: boolean }) =>
    open ? <div>Generic Asset Details Sheet</div> : null,
  UpdateValuationModal: () => null,
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

import { HoldingsPage } from "./holdings-page";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HoldingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("holdings page specialized asset editors", () => {
  it("opens the insurance policy editor for insurance holdings", async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByRole("button", { name: "Edit Chubb" }));

    expect(screen.getByText("Edit Insurance Policy")).toBeInTheDocument();
    expect(screen.queryByText("Generic Asset Details Sheet")).not.toBeInTheDocument();
  });
});
