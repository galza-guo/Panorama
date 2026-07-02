import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AlternativeAssetHolding } from "@/lib/types";

vi.mock("./alternative-assets", () => ({
  AssetDetailsSheet: ({ open }: { open: boolean }) =>
    open ? <div>Mock Generic Details Sheet</div> : null,
  UpdateValuationModal: () => null,
  AlternativeAssetQuickAddModal: () => null,
  ValueHistoryDataGrid: () => null,
}));

vi.mock("./alternative-assets/hooks/use-alternative-asset-mutations", () => ({
  useAlternativeAssetMutations: () => ({
    deleteMutation: { mutate: vi.fn(), isPending: false },
    updateMetadataMutation: { mutateAsync: vi.fn(), isPending: false },
    updateValuationMutation: { mutateAsync: vi.fn(), isPending: false },
    linkLiabilityMutation: { mutateAsync: vi.fn(), isPending: false },
    unlinkLiabilityMutation: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock("@/hooks/use-alternative-assets", () => ({
  useAlternativeHoldings: () => ({ data: [] }),
  useLinkedLiabilities: () => ({ data: [] }),
}));

vi.mock("@/hooks/use-accounts", () => ({
  useAccounts: () => ({
    accounts: [{ id: "acc-hkd", name: "HSBC HKD", currency: "HKD" }],
    isLoading: false,
  }),
}));

vi.mock("@/pages/mpf/components/mpf-asset-editor-sheet", () => ({
  MpfAssetEditorSheet: ({ open }: { open: boolean }) =>
    open ? <div>Mock MPF Edit Sheet</div> : null,
}));

vi.mock("@/pages/time-deposits/components/time-deposit-editor-sheet", () => ({
  TimeDepositEditorSheet: ({ open }: { open: boolean }) =>
    open ? <div>Mock Time Deposit Edit Sheet</div> : null,
}));

vi.mock("@/pages/insurance/components/insurance-policy-editor-sheet", () => ({
  InsurancePolicyEditorSheet: ({ open }: { open: boolean }) =>
    open ? <div>Mock Insurance Edit Sheet</div> : null,
}));

import { getDetailRows, useAlternativeAssetActions } from "./alternative-asset-content";

function buildHolding(): AlternativeAssetHolding {
  return {
    id: "ALT-TD-1",
    kind: "other",
    name: "HSBC 3M Deposit",
    symbol: "Time Deposit",
    currency: "HKD",
    marketValue: "10100",
    purchasePrice: "10000",
    purchaseDate: "2026-01-01",
    valuationDate: "2026-02-20T00:00:00Z",
    metadata: {
      panorama_category: "time_deposit",
      sub_type: "time_deposit",
      owner: "Alice",
      provider: "HSBC",
      principal: "10000",
      start_date: "2026-01-01",
      maturity_date: "2026-04-11",
      quoted_annual_rate: "7.3",
      guaranteed_maturity_value: "10200",
      valuation_mode: "derived",
      valuation_date: "2026-02-20",
      status: "active",
    },
  };
}

function buildInsuranceHolding(): AlternativeAssetHolding {
  return {
    id: "ALT-INS-1",
    kind: "other",
    name: "AIA Wealth Series",
    symbol: "Insurance",
    currency: "HKD",
    marketValue: "125000",
    purchasePrice: undefined,
    purchaseDate: undefined,
    valuationDate: "2026-03-13T00:00:00Z",
    metadata: {
      panorama_category: "insurance",
      sub_type: "insurance",
      insurance_provider: "AIA",
      policy_type: "Whole Life",
      valuation_date: "2026-03-13",
    },
  };
}

function EditActionHarness({ holding }: { holding: AlternativeAssetHolding }) {
  const actions = useAlternativeAssetActions({
    holding,
    assetProfile: null,
    allHoldings: [holding],
    onNavigateBack: vi.fn(),
  });

  return (
    <div>
      <button type="button" onClick={actions.openEditDetails}>
        Edit
      </button>
      {actions.modals}
    </div>
  );
}

describe("alternative asset content", () => {
  it("builds time deposit detail rows", () => {
    const holding = buildHolding();
    const rows = getDetailRows("time_deposit", holding.metadata ?? {}, holding, false);

    expect(rows.map((row) => row.label)).toEqual(
      expect.arrayContaining([
        "Owner",
        "Provider",
        "Principal",
        "Start Date",
        "Maturity Date",
        "Annualized Return",
        "Maturity Value",
        "Days Left",
      ]),
    );

    render(
      <div>
        {rows.map((row) => (
          <div key={row.label}>
            <span>{row.label}</span>
            <span>{row.value}</span>
          </div>
        ))}
      </div>,
    );

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("HSBC")).toBeInTheDocument();
    expect(screen.getByText("7.30%")).toBeInTheDocument();
    expect(screen.getByText("50 days")).toBeInTheDocument();
  });

  it("opens the insurance editor for insurance assets", () => {
    render(<EditActionHarness holding={buildInsuranceHolding()} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByText("Mock Insurance Edit Sheet")).toBeInTheDocument();
    expect(screen.queryByText("Mock Generic Details Sheet")).not.toBeInTheDocument();
  });
});
