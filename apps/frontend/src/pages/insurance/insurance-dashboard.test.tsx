import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AlternativeAssetHolding } from "@/lib/types";

const {
  useAlternativeHoldingsMock,
  useAlternativeAssetMutationsMock,
  editorValuesRef,
  getDynamicNavItemsMock,
  subscribeToNavigationUpdatesMock,
  useSettingsContextMock,
} = vi.hoisted(() => ({
  useAlternativeHoldingsMock: vi.fn(),
  useAlternativeAssetMutationsMock: vi.fn(),
  editorValuesRef: { current: null as Record<string, unknown> | null },
  getDynamicNavItemsMock: vi.fn(),
  subscribeToNavigationUpdatesMock: vi.fn(),
  useSettingsContextMock: vi.fn(),
}));

vi.mock("@/hooks/use-alternative-assets", () => ({
  useAlternativeHoldings: useAlternativeHoldingsMock,
}));

vi.mock("@/pages/asset/alternative-assets/hooks", () => ({
  useAlternativeAssetMutations: useAlternativeAssetMutationsMock,
}));

vi.mock("@/addons/addons-runtime-context", () => ({
  getDynamicNavItems: getDynamicNavItemsMock,
  subscribeToNavigationUpdates: subscribeToNavigationUpdatesMock,
}));

vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: useSettingsContextMock,
}));

vi.mock("./components/insurance-policy-editor-sheet", () => ({
  InsurancePolicyEditorSheet: ({
    open,
    mode,
    onSubmit,
  }: {
    open: boolean;
    mode: "create" | "edit";
    onSubmit: (values: never) => Promise<void>;
  }) =>
    open ? (
      <div>
        <div>{mode === "create" ? "Mock Create Insurance Sheet" : "Mock Edit Insurance Sheet"}</div>
        <button type="button" onClick={() => void onSubmit(editorValuesRef.current as never)}>
          {mode === "create" ? "Submit Create Insurance Policy" : "Submit Edit Insurance Policy"}
        </button>
      </div>
    ) : null,
}));

import InsuranceDashboard from "./insurance-dashboard";
import { useNavigation } from "../layouts/navigation/app-navigation";

const TODAY = new Date("2026-03-13T00:00:00Z");

function buildInsuranceHolding(
  overrides: Partial<AlternativeAssetHolding> = {},
): AlternativeAssetHolding {
  return {
    id: "ALT-INS-1",
    kind: "other",
    name: "AIA Wealth Series",
    symbol: "Insurance",
    currency: "HKD",
    marketValue: "125000",
    valuationDate: "2026-03-10T00:00:00Z",
    metadata: {
      panorama_category: "insurance",
      sub_type: "insurance",
      owner: "Alice",
      insurance_provider: "AIA",
      policy_type: "Whole Life",
      start_date: "2024-01-01",
      total_paid_to_date: "100000",
      payment_status: "paying",
      next_due_date: "2026-03-22",
      valuation_date: "2026-03-10",
    },
    ...overrides,
  };
}

function buildTimeDepositHolding(): AlternativeAssetHolding {
  return {
    id: "ALT-TD-1",
    kind: "other",
    name: "HSBC Deposit",
    symbol: "Time Deposit",
    currency: "HKD",
    marketValue: "10100",
    valuationDate: "2026-03-10T00:00:00Z",
    metadata: {
      panorama_category: "time_deposit",
      sub_type: "time_deposit",
      provider: "HSBC",
      principal: "10000",
      start_date: "2026-01-01",
      maturity_date: "2026-04-11",
      quoted_annual_rate: "7.3",
    },
  };
}

function buildFormValues(overrides: Record<string, unknown> = {}) {
  return {
    name: "New Insurance Policy",
    currency: "HKD",
    currentValue: "125000",
    owner: "Alice",
    provider: "AIA",
    policyType: "Whole Life",
    startDate: new Date("2024-01-01T00:00:00Z"),
    totalPaidToDate: "100000",
    paymentStatus: "paying",
    nextDueDate: new Date("2026-03-22T00:00:00Z"),
    notes: "Reference note",
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <InsuranceDashboard today={TODAY} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("insurance dashboard", () => {
  beforeEach(() => {
    editorValuesRef.current = buildFormValues();
    getDynamicNavItemsMock.mockReturnValue([]);
    subscribeToNavigationUpdatesMock.mockReturnValue(() => {});
    useSettingsContextMock.mockReturnValue({
      settings: {
        theme: "light",
        font: "font-mono",
        baseCurrency: "USD",
        instanceId: "test-instance",
        onboardingCompleted: true,
        autoUpdateCheckEnabled: true,
        menuBarVisible: true,
        syncEnabled: true,
        mpfVisible: true,
      },
      isLoading: false,
      isError: false,
      updateBaseCurrency: vi.fn(),
      updateSettings: vi.fn(),
      refetch: vi.fn(),
      accountsGrouped: true,
      setAccountsGrouped: vi.fn(),
    });
    useAlternativeAssetMutationsMock.mockReturnValue({
      createMutation: { isPending: false, mutateAsync: vi.fn() },
      updateMetadataMutation: { isPending: false, mutateAsync: vi.fn() },
      updateValuationMutation: { isPending: false, mutateAsync: vi.fn() },
    });
  });

  afterEach(() => {
    useAlternativeHoldingsMock.mockReset();
    useAlternativeAssetMutationsMock.mockReset();
    editorValuesRef.current = null;
    getDynamicNavItemsMock.mockReset();
    subscribeToNavigationUpdatesMock.mockReset();
    useSettingsContextMock.mockReset();
  });

  it("does not include Insurance in primary navigation", () => {
    const { result } = renderHook(() => useNavigation());

    expect(
      result.current.primary.some(
        (item) => item.title === "Insurance" && item.href === "/insurance",
      ),
    ).toBe(false);
  });

  it("renders an empty state when there are no insurance assets", () => {
    useAlternativeHoldingsMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage();

    expect(screen.getByRole("heading", { name: "Insurance" })).toBeInTheDocument();
    expect(screen.getByText("No insurance assets found.")).toBeInTheDocument();
  });

  it("filters insurance holdings and renders cash value and payment reminders", () => {
    useAlternativeHoldingsMock.mockReturnValue({
      data: [
        buildInsuranceHolding(),
        buildInsuranceHolding({
          id: "ALT-INS-2",
          name: "Manulife Saver",
          currency: "USD",
          marketValue: "30000",
          metadata: {
            panorama_category: "insurance",
            sub_type: "insurance",
            owner: "Bob",
            insurance_provider: "Manulife",
            policy_type: "Savings",
            total_paid_to_date: "28000",
            payment_status: "paid_up",
            valuation_date: "2026-03-12",
          },
        }),
        buildTimeDepositHolding(),
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage();

    expect(screen.getByText("AIA Wealth Series")).toBeInTheDocument();
    expect(screen.getByText("Manulife Saver")).toBeInTheDocument();
    expect(screen.queryByText("HSBC Deposit")).not.toBeInTheDocument();
    expect(screen.getAllByText("Cash Value")).not.toHaveLength(0);
    expect(screen.getAllByText("Next payment in 9d")).toHaveLength(2);
    expect(screen.getAllByText("Paid-up")).toHaveLength(2);
    expect(screen.getByText("Total Premiums Paid")).toBeInTheDocument();
  });

  it("creates an insurance policy with Panorama metadata", async () => {
    const createMutation = vi.fn().mockResolvedValue({ assetId: "ALT-INS-NEW" });
    const updateMetadataMutation = vi.fn().mockResolvedValue(undefined);

    useAlternativeAssetMutationsMock.mockReturnValue({
      createMutation: { isPending: false, mutateAsync: createMutation },
      updateMetadataMutation: { isPending: false, mutateAsync: updateMetadataMutation },
      updateValuationMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) },
    });
    useAlternativeHoldingsMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });
    editorValuesRef.current = buildFormValues();

    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: "Add Insurance Policy" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Submit Create Insurance Policy" }));

    await waitFor(() =>
      expect(createMutation).toHaveBeenCalledWith({
        kind: "other",
        name: "New Insurance Policy",
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
        assetId: "ALT-INS-NEW",
        name: "New Insurance Policy",
        notes: "Reference note",
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
