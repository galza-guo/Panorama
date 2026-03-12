import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useAlternativeAssetMutationsMock,
  useSettingsContextMock,
  editorValuesRef,
} = vi.hoisted(() => ({
  useAlternativeAssetMutationsMock: vi.fn(),
  useSettingsContextMock: vi.fn(),
  editorValuesRef: { current: null as Record<string, unknown> | null },
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
        <button type="button" onClick={() => void onSubmit(editorValuesRef.current as never)}>
          Submit Time Deposit
        </button>
      </div>
    ) : null,
}));

import { AlternativeAssetQuickAddModal } from "./alternative-asset-quick-add-modal";

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

function renderModal() {
  const queryClient = new QueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <AlternativeAssetQuickAddModal open={true} onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("alternative asset quick add modal", () => {
  beforeEach(() => {
    editorValuesRef.current = buildFormValues();
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
    editorValuesRef.current = null;
  });

  it("shows time deposit as an add asset option and opens the specialized sheet", async () => {
    const user = userEvent.setup();

    renderModal();

    await user.click(screen.getByRole("button", { name: /Time Deposit/i }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Mock Time Deposit Sheet")).toBeInTheDocument();
  });

  it("creates a time deposit from the quick add flow", async () => {
    const user = userEvent.setup();
    const createMutation = vi.fn().mockResolvedValue({ assetId: "ALT-TD-1" });
    const updateMetadataMutation = vi.fn().mockResolvedValue(undefined);

    useAlternativeAssetMutationsMock.mockReturnValue({
      createMutation: { isPending: false, mutateAsync: createMutation },
      updateMetadataMutation: { isPending: false, mutateAsync: updateMetadataMutation },
    });

    renderModal();

    await user.click(screen.getByRole("button", { name: /Time Deposit/i }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Submit Time Deposit" }));

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
    });
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
    });
  });
});
