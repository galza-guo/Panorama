import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useAlternativeAssetMutationsMock,
  useSettingsContextMock,
  timeDepositEditorValuesRef,
  insuranceEditorValuesRef,
} = vi.hoisted(() => ({
  useAlternativeAssetMutationsMock: vi.fn(),
  useSettingsContextMock: vi.fn(),
  timeDepositEditorValuesRef: { current: null as Record<string, unknown> | null },
  insuranceEditorValuesRef: { current: null as Record<string, unknown> | null },
}));

vi.mock("@/pages/asset/alternative-assets/hooks/use-alternative-asset-mutations", () => ({
  useAlternativeAssetMutations: useAlternativeAssetMutationsMock,
}));

vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: useSettingsContextMock,
}));

vi.mock("@/pages/time-deposits/components/time-deposit-editor-sheet", () => ({
  TimeDepositEditorSheet: ({
    open,
    onSubmit,
  }: {
    open: boolean;
    onSubmit: (values: never) => Promise<void>;
  }) =>
    open ? (
      <div>
        <div>Mock Time Deposit Sheet</div>
        <button type="button" onClick={() => void onSubmit(timeDepositEditorValuesRef.current as never)}>
          Submit Time Deposit
        </button>
      </div>
    ) : null,
}));

vi.mock("@/pages/insurance/components/insurance-policy-editor-sheet", () => ({
  InsurancePolicyEditorSheet: ({
    open,
    onSubmit,
  }: {
    open: boolean;
    onSubmit: (values: never) => Promise<void>;
  }) =>
    open ? (
      <div>
        <div>Mock Insurance Sheet</div>
        <button type="button" onClick={() => void onSubmit(insuranceEditorValuesRef.current as never)}>
          Submit Insurance
        </button>
      </div>
    ) : null,
}));

import { AlternativeAssetQuickAddModal } from "./alternative-asset-quick-add-modal";

const TODAY = new Date("2026-03-13T00:00:00Z");

function buildFormValues(overrides: Record<string, unknown> = {}) {
  return {
    name: "HSBC 3M Deposit",
    currency: "HKD",
    owner: "Alice",
    provider: "HSBC",
    principal: "10000",
    startDate: new Date("2026-01-01T00:00:00Z"),
    maturityDate: new Date("2026-04-11T00:00:00Z"),
    valuationDate: new Date("2026-02-20T00:00:00Z"),
    inputMode: "rate",
    quotedAnnualRate: "7.3",
    guaranteedMaturityValue: "",
    valuationMode: "derived",
    currentValueOverride: "",
    notes: "Quick add note",
    ...overrides,
  };
}

function buildInsuranceFormValues(overrides: Record<string, unknown> = {}) {
  return {
    name: "AIA Wealth Series",
    currency: "HKD",
    currentValue: "125000",
    owner: "Alice",
    provider: "AIA",
    policyType: "Whole Life",
    startDate: new Date("2024-01-01T00:00:00Z"),
    paymentStatus: "paying",
    nextDueDate: new Date("2026-03-22T00:00:00Z"),
    totalPaidToDate: "100000",
    notes: "Quick add note",
    ...overrides,
  };
}

function renderModal() {
  const queryClient = new QueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <AlternativeAssetQuickAddModal open={true} onOpenChange={vi.fn()} today={TODAY} />
    </QueryClientProvider>,
  );
}

describe("alternative asset quick add modal", () => {
  beforeEach(() => {
    timeDepositEditorValuesRef.current = buildFormValues();
    insuranceEditorValuesRef.current = buildInsuranceFormValues();
    useSettingsContextMock.mockReturnValue({
      settings: {
        baseCurrency: "HKD",
      },
    });
    useAlternativeAssetMutationsMock.mockReturnValue({
      createMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue({ assetId: "ALT-TD-1" }) },
      updateMetadataMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    useAlternativeAssetMutationsMock.mockReset();
    useSettingsContextMock.mockReset();
    timeDepositEditorValuesRef.current = null;
    insuranceEditorValuesRef.current = null;
  });

  it("shows time deposit as an add asset option and opens the specialized sheet", async () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /Time Deposit/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Mock Time Deposit Sheet")).toBeInTheDocument();
  });

  it("creates a time deposit from the quick add flow", async () => {
    const createMutation = vi.fn().mockResolvedValue({ assetId: "ALT-TD-1" });
    const updateMetadataMutation = vi.fn().mockResolvedValue(undefined);

    useAlternativeAssetMutationsMock.mockReturnValue({
      createMutation: { isPending: false, mutateAsync: createMutation },
      updateMetadataMutation: { isPending: false, mutateAsync: updateMetadataMutation },
    });

    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /Time Deposit/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Time Deposit" }));

    await waitFor(() =>
      expect(createMutation).toHaveBeenCalledWith({
        kind: "other",
        name: "HSBC 3M Deposit",
        currency: "HKD",
        currentValue: "10100",
        valueDate: "2026-02-20",
        metadata: {
          panorama_category: "time_deposit",
          sub_type: "time_deposit",
          owner: "Alice",
          provider: "HSBC",
          principal: 10000,
          start_date: "2026-01-01",
          maturity_date: "2026-04-11",
          quoted_annual_rate: 7.3,
          valuation_mode: "derived",
          valuation_date: "2026-02-20",
          status: "active",
          purchase_price: "10000",
          purchase_date: "2026-01-01",
        },
      }),
    );
    await waitFor(() =>
      expect(updateMetadataMutation).toHaveBeenCalledWith({
        assetId: "ALT-TD-1",
        name: "HSBC 3M Deposit",
        notes: "Quick add note",
        metadata: {
          panorama_category: "time_deposit",
          sub_type: "time_deposit",
          owner: "Alice",
          provider: "HSBC",
          principal: 10000,
          start_date: "2026-01-01",
          maturity_date: "2026-04-11",
          quoted_annual_rate: 7.3,
          guaranteed_maturity_value: null,
          valuation_mode: "derived",
          current_value_override: null,
          valuation_date: "2026-02-20",
          status: "active",
          purchase_price: "10000",
          purchase_date: "2026-01-01",
        },
      }),
    );
  });

  it("shows insurance as an add asset option and opens the specialized sheet", async () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /Insurance/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Mock Insurance Sheet")).toBeInTheDocument();
  });

  it("creates an insurance policy from the quick add flow", async () => {
    const createMutation = vi.fn().mockResolvedValue({ assetId: "ALT-INS-1" });
    const updateMetadataMutation = vi.fn().mockResolvedValue(undefined);

    useAlternativeAssetMutationsMock.mockReturnValue({
      createMutation: { isPending: false, mutateAsync: createMutation },
      updateMetadataMutation: { isPending: false, mutateAsync: updateMetadataMutation },
    });

    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /Insurance/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Insurance" }));

    await waitFor(() =>
      expect(createMutation).toHaveBeenCalledWith({
        kind: "other",
        name: "AIA Wealth Series",
        currency: "HKD",
        currentValue: "125000",
        valueDate: "2026-03-13",
        metadata: {
          panorama_category: "insurance",
          sub_type: "insurance",
          owner: "Alice",
          policy_type: "Whole Life",
          insurance_provider: "AIA",
          start_date: "2024-01-01",
          valuation_date: "2026-03-13",
          total_paid_to_date: 100000,
          payment_status: "paying",
          next_due_date: "2026-03-22",
        },
      }),
    );
    await waitFor(() =>
      expect(updateMetadataMutation).toHaveBeenCalledWith({
        assetId: "ALT-INS-1",
        name: "AIA Wealth Series",
        notes: "Quick add note",
        metadata: {
          panorama_category: "insurance",
          sub_type: "insurance",
          owner: "Alice",
          policy_type: "Whole Life",
          insurance_provider: "AIA",
          start_date: "2024-01-01",
          valuation_date: "2026-03-13",
          total_paid_to_date: 100000,
          payment_status: "paying",
          next_due_date: "2026-03-22",
        },
      }),
    );
  });
});
