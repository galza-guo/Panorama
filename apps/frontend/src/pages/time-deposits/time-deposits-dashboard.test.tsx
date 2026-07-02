import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Account, AlternativeAssetHolding } from "@/lib/types";

const {
  createActivityMock,
  saveActivitiesMock,
  useAccountsMock,
  useAlternativeHoldingsMock,
  useAlternativeAssetMutationsMock,
  editorValuesRef,
} =
  vi.hoisted(() => ({
    createActivityMock: vi.fn(),
    saveActivitiesMock: vi.fn(),
    useAccountsMock: vi.fn(),
    useAlternativeHoldingsMock: vi.fn(),
    useAlternativeAssetMutationsMock: vi.fn(),
    editorValuesRef: { current: null as Record<string, unknown> | null },
  }));

vi.mock("@/adapters", () => ({
  createActivity: createActivityMock,
  saveActivities: saveActivitiesMock,
}));

vi.mock("@/hooks/use-accounts", () => ({
  useAccounts: useAccountsMock,
}));

vi.mock("@/hooks/use-alternative-assets", () => ({
  useAlternativeHoldings: useAlternativeHoldingsMock,
}));

vi.mock("@/pages/asset/alternative-assets/hooks", () => ({
  useAlternativeAssetMutations: useAlternativeAssetMutationsMock,
}));

vi.mock("./components/time-deposit-editor-sheet", () => ({
  TimeDepositEditorSheet: ({
    open,
    mode,
    onSubmit,
    accounts,
  }: {
    open: boolean;
    mode: "create" | "edit";
    accounts: Pick<Account, "id" | "name" | "currency">[];
    onSubmit: (values: never) => Promise<void>;
  }) =>
    open ? (
      <div>
        <div>{mode === "create" ? "Mock Create Sheet" : "Mock Edit Sheet"}</div>
        <div data-testid="mock-linked-account-count">{accounts.length}</div>
        <button type="button" onClick={() => void onSubmit(editorValuesRef.current as never)}>
          {mode === "create" ? "Submit Create Time Deposit" : "Submit Edit Time Deposit"}
        </button>
      </div>
    ) : null,
}));

import TimeDepositsDashboard from "./time-deposits-dashboard";

const TODAY = new Date("2026-02-20T00:00:00Z");

function buildHolding(overrides: Partial<AlternativeAssetHolding> = {}): AlternativeAssetHolding {
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
      linked_account_id: "acc-hkd",
      principal: "10000",
      start_date: "2026-01-01",
      maturity_date: "2026-04-11",
      quoted_annual_rate: "7.3",
      guaranteed_maturity_value: "10200",
      valuation_mode: "derived",
      valuation_date: "2026-02-20",
      status: "active",
    },
    ...overrides,
  };
}

function buildInsuranceHolding(): AlternativeAssetHolding {
  return {
    id: "ALT-INS-1",
    kind: "other",
    name: "AIA Policy",
    symbol: "Insurance",
    currency: "HKD",
    marketValue: "5000",
    purchasePrice: "4000",
    purchaseDate: "2024-01-01",
    valuationDate: "2026-02-20T00:00:00Z",
    metadata: {
      panorama_category: "insurance",
      sub_type: "insurance",
      owner: "Alice",
      insurance_provider: "AIA",
      valuation_date: "2026-02-20",
    },
  };
}

function buildFormValues(overrides: Record<string, unknown> = {}) {
  return {
    name: "New Deposit",
    currency: "HKD",
    owner: "Alice",
    provider: "HSBC",
    linkedAccountId: "acc-hkd",
    principal: "10000",
    startDate: new Date("2026-01-01T00:00:00Z"),
    maturityDate: new Date("2026-04-11T00:00:00Z"),
    valuationDate: new Date("2026-02-20T00:00:00Z"),
    inputMode: "rate",
    quotedAnnualRate: "7.3",
    guaranteedMaturityValue: "",
    valuationMode: "derived",
    currentValueOverride: "",
    notes: "Reference note",
    ...overrides,
  };
}

function renderPage(today = TODAY) {
  const queryClient = new QueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TimeDepositsDashboard today={today} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("time deposits dashboard", () => {
  beforeEach(() => {
    editorValuesRef.current = buildFormValues();
    createActivityMock.mockResolvedValue({ id: "act-open" });
    saveActivitiesMock.mockResolvedValue({
      created: [{ id: "act-sell" }, { id: "act-interest" }],
      updated: [],
      deleted: [],
      createdMappings: [],
      errors: [],
    });
    useAccountsMock.mockReturnValue({
      accounts: [
        {
          id: "acc-hkd",
          name: "HSBC HKD",
          accountType: "CASH",
          balance: 0,
          currency: "HKD",
          isDefault: false,
          isActive: true,
          isArchived: false,
          trackingMode: "TRANSACTIONS",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    useAlternativeAssetMutationsMock.mockReturnValue({
      createMutation: {
        isPending: false,
        mutateAsync: vi.fn().mockResolvedValue({ assetId: "ALT-TD-NEW" }),
      },
      updateMetadataMutation: {
        isPending: false,
        mutateAsync: vi.fn().mockResolvedValue(undefined),
      },
      updateValuationMutation: {
        isPending: false,
        mutateAsync: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    createActivityMock.mockReset();
    saveActivitiesMock.mockReset();
    useAccountsMock.mockReset();
    useAlternativeHoldingsMock.mockReset();
    useAlternativeAssetMutationsMock.mockReset();
    editorValuesRef.current = null;
  });

  it("renders an empty state when there are no time deposits", () => {
    useAlternativeHoldingsMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage();

    expect(screen.getByRole("heading", { name: "Time Deposits" })).toBeInTheDocument();
    expect(screen.getByText("No time deposits found.")).toBeInTheDocument();
  });

  it("filters time deposits and renders summary totals", () => {
    useAlternativeHoldingsMock.mockReturnValue({
      data: [
        buildHolding(),
        buildHolding({
          id: "ALT-TD-2",
          name: "BOC 6M Deposit",
          marketValue: "20200",
          metadata: {
            panorama_category: "time_deposit",
            sub_type: "time_deposit",
            owner: "Bob",
            provider: "BOC",
            principal: "20000",
            start_date: "2026-01-15",
            maturity_date: "2026-07-14",
            quoted_annual_rate: "3.65",
            guaranteed_maturity_value: "20363",
            valuation_mode: "derived",
            valuation_date: "2026-02-20",
            status: "active",
          },
        }),
        buildInsuranceHolding(),
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage();

    expect(screen.getByText("HSBC 3M Deposit")).toBeInTheDocument();
    expect(screen.getByText("BOC 6M Deposit")).toBeInTheDocument();
    expect(screen.queryByText("AIA Policy")).not.toBeInTheDocument();
    expect(screen.getByTestId("summary-count")).toHaveTextContent("2");
    expect(screen.getByTestId("summary-current-HKD")).toHaveAttribute("data-value", "30172.60");
    expect(screen.getByTestId("summary-maturity-HKD")).toHaveAttribute("data-value", "30563.00");
    expect(screen.getByTestId("summary-next-days-left")).toHaveAttribute("data-value", "50");
    expect(screen.getByText("50d left")).toBeInTheDocument();
    expect(screen.getByText("144d left")).toBeInTheDocument();
    expect(screen.getAllByText("Est.")).toHaveLength(2);
  });

  it("creates a time deposit with Panorama metadata and a derived valuation", async () => {
    const user = userEvent.setup();
    const createMutation = vi.fn().mockResolvedValue({ assetId: "ALT-TD-NEW" });
    const updateMetadataMutation = vi.fn().mockResolvedValue(undefined);

    useAlternativeAssetMutationsMock.mockReturnValue({
      createMutation: { isPending: false, mutateAsync: createMutation },
      updateMetadataMutation: { isPending: false, mutateAsync: updateMetadataMutation },
      updateValuationMutation: {
        isPending: false,
        mutateAsync: vi.fn().mockResolvedValue(undefined),
      },
    });
    useAlternativeHoldingsMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });
    editorValuesRef.current = buildFormValues();

    renderPage();

    await user.click(screen.getAllByRole("button", { name: "Add Time Deposit" })[0]);
    await user.click(screen.getByRole("button", { name: "Submit Create Time Deposit" }));

    expect(createMutation).toHaveBeenCalledWith({
      kind: "time_deposit",
      name: "New Deposit",
      currency: "HKD",
      currentValue: "10100",
      valueDate: "2026-02-20",
      metadata: {
        panorama_category: "time_deposit",
        sub_type: "time_deposit",
        owner: "Alice",
        provider: "HSBC",
        linked_account_id: "acc-hkd",
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
    expect(createActivityMock).toHaveBeenCalledWith({
      accountId: "acc-hkd",
      activityType: "BUY",
      activityDate: new Date("2026-01-01T00:00:00Z").toISOString(),
      symbol: {
        id: "ALT-TD-NEW",
        kind: "TIME_DEPOSIT",
        name: "New Deposit",
        quoteMode: "MANUAL",
      },
      quantity: "1",
      unitPrice: "10000",
      currency: "HKD",
      metadata: {
        panorama_time_deposit_role: "opening",
        asset_id: "ALT-TD-NEW",
      },
    });
    expect(updateMetadataMutation).toHaveBeenCalledWith({
      assetId: "ALT-TD-NEW",
      name: "New Deposit",
      notes: "Reference note",
      metadata: {
        panorama_category: "time_deposit",
        sub_type: "time_deposit",
        owner: "Alice",
        provider: "HSBC",
        linked_account_id: "acc-hkd",
        principal: 10000,
        start_date: "2026-01-01",
        maturity_date: "2026-04-11",
        quoted_annual_rate: 7.3,
        guaranteed_maturity_value: null,
        valuation_mode: "derived",
        current_value_override: null,
        valuation_date: "2026-02-20",
        status: "active",
        opening_activity_id: "act-open",
        purchase_price: "10000",
        purchase_date: "2026-01-01",
      },
    });
  });

  it("updates metadata and valuation for an edited time deposit", async () => {
    const user = userEvent.setup();
    const updateMetadataMutation = vi.fn().mockResolvedValue(undefined);
    const updateValuationMutation = vi.fn().mockResolvedValue(undefined);

    useAlternativeAssetMutationsMock.mockReturnValue({
      createMutation: {
        isPending: false,
        mutateAsync: vi.fn().mockResolvedValue({ assetId: "ALT-TD-NEW" }),
      },
      updateMetadataMutation: { isPending: false, mutateAsync: updateMetadataMutation },
      updateValuationMutation: { isPending: false, mutateAsync: updateValuationMutation },
    });
    useAlternativeHoldingsMock.mockReturnValue({
      data: [buildHolding()],
      isLoading: false,
      isError: false,
      error: null,
    });
    editorValuesRef.current = buildFormValues({
      name: "HSBC 3M Deposit",
      notes: "Updated note",
      valuationMode: "manual",
      currentValueOverride: "10123.45",
    });

    renderPage();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Submit Edit Time Deposit" }));

    expect(updateMetadataMutation).toHaveBeenCalledWith({
      assetId: "ALT-TD-1",
      name: "HSBC 3M Deposit",
      notes: "Updated note",
      currency: "HKD",
      metadata: {
        panorama_category: "time_deposit",
        sub_type: "time_deposit",
        owner: "Alice",
        provider: "HSBC",
        linked_account_id: "acc-hkd",
        principal: 10000,
        start_date: "2026-01-01",
        maturity_date: "2026-04-11",
        quoted_annual_rate: 7.3,
        guaranteed_maturity_value: null,
        valuation_mode: "manual",
        current_value_override: 10123.45,
        valuation_date: "2026-02-20",
        status: "active",
        purchase_price: "10000",
        purchase_date: "2026-01-01",
      },
    });
    expect(updateValuationMutation).toHaveBeenCalledWith({
      assetId: "ALT-TD-1",
      request: {
        value: "10123.45",
        date: "2026-02-20",
      },
    });
  });

  it("shows settle to cash for active matured deposits", () => {
    useAlternativeHoldingsMock.mockReturnValue({
      data: [
        buildHolding({
          metadata: {
            panorama_category: "time_deposit",
            sub_type: "time_deposit",
            owner: "Alice",
            provider: "HSBC",
            linked_account_id: "acc-hkd",
            principal: "10000",
            start_date: "2026-01-01",
            maturity_date: "2026-02-20",
            guaranteed_maturity_value: "10200",
            valuation_mode: "derived",
            valuation_date: "2026-02-20",
            status: "active",
          },
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage(new Date("2026-02-21T00:00:00Z"));

    expect(screen.getByRole("button", { name: "Settle to Cash" })).toBeInTheDocument();
  });

  it("settles a matured deposit with principal and interest activities", async () => {
    const user = userEvent.setup();
    const updateMetadataMutation = vi.fn().mockResolvedValue(undefined);
    const updateValuationMutation = vi.fn().mockResolvedValue(undefined);

    useAlternativeAssetMutationsMock.mockReturnValue({
      createMutation: {
        isPending: false,
        mutateAsync: vi.fn().mockResolvedValue({ assetId: "ALT-TD-NEW" }),
      },
      updateMetadataMutation: { isPending: false, mutateAsync: updateMetadataMutation },
      updateValuationMutation: { isPending: false, mutateAsync: updateValuationMutation },
    });
    useAlternativeHoldingsMock.mockReturnValue({
      data: [
        buildHolding({
          metadata: {
            panorama_category: "time_deposit",
            sub_type: "time_deposit",
            owner: "Alice",
            provider: "HSBC",
            linked_account_id: "acc-hkd",
            principal: "10000",
            start_date: "2026-01-01",
            maturity_date: "2026-02-20",
            guaranteed_maturity_value: "10200",
            valuation_mode: "derived",
            valuation_date: "2026-02-20",
            status: "active",
          },
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage(new Date("2026-02-21T00:00:00Z"));

    await user.click(screen.getByRole("button", { name: "Settle to Cash" }));

    expect(saveActivitiesMock).toHaveBeenCalledWith({
      creates: [
        {
          accountId: "acc-hkd",
          activityType: "SELL",
          activityDate: new Date("2026-02-20T00:00:00Z").toISOString(),
          sourceGroupId: "time-deposit-settlement-ALT-TD-1-2026-02-20",
          symbol: {
            id: "ALT-TD-1",
            kind: "TIME_DEPOSIT",
            name: "HSBC 3M Deposit",
            quoteMode: "MANUAL",
          },
          quantity: "1",
          unitPrice: "10000",
          currency: "HKD",
          metadata: {
            panorama_time_deposit_role: "settlement_principal",
            asset_id: "ALT-TD-1",
          },
        },
        {
          accountId: "acc-hkd",
          activityType: "INTEREST",
          activityDate: new Date("2026-02-20T00:00:00Z").toISOString(),
          sourceGroupId: "time-deposit-settlement-ALT-TD-1-2026-02-20",
          amount: "200",
          currency: "HKD",
          metadata: {
            panorama_time_deposit_role: "settlement_interest",
            asset_id: "ALT-TD-1",
          },
        },
      ],
    });
    expect(updateMetadataMutation).toHaveBeenCalledWith({
      assetId: "ALT-TD-1",
      metadata: {
        panorama_category: "time_deposit",
        sub_type: "time_deposit",
        status: "closed",
        settlement_date: "2026-02-20",
        settlement_account_id: "acc-hkd",
        settlement_activity_ids: ["act-sell", "act-interest"],
        settled_principal: 10000,
        settled_interest: 200,
        actual_maturity_value: 10200,
      },
    });
    expect(updateValuationMutation).toHaveBeenCalledWith({
      assetId: "ALT-TD-1",
      request: {
        value: "0",
        date: "2026-02-20",
      },
    });
  });

  it("skips the interest activity when settlement interest is zero", async () => {
    const user = userEvent.setup();
    const updateMetadataMutation = vi.fn().mockResolvedValue(undefined);
    saveActivitiesMock.mockResolvedValue({
      created: [{ id: "act-sell" }],
      updated: [],
      deleted: [],
      createdMappings: [],
      errors: [],
    });

    useAlternativeAssetMutationsMock.mockReturnValue({
      createMutation: {
        isPending: false,
        mutateAsync: vi.fn().mockResolvedValue({ assetId: "ALT-TD-NEW" }),
      },
      updateMetadataMutation: { isPending: false, mutateAsync: updateMetadataMutation },
      updateValuationMutation: {
        isPending: false,
        mutateAsync: vi.fn().mockResolvedValue(undefined),
      },
    });
    useAlternativeHoldingsMock.mockReturnValue({
      data: [
        buildHolding({
          metadata: {
            panorama_category: "time_deposit",
            sub_type: "time_deposit",
            owner: "Alice",
            provider: "HSBC",
            linked_account_id: "acc-hkd",
            principal: "10000",
            start_date: "2026-01-01",
            maturity_date: "2026-02-20",
            guaranteed_maturity_value: "10000",
            valuation_mode: "derived",
            valuation_date: "2026-02-20",
            status: "active",
          },
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage(new Date("2026-02-21T00:00:00Z"));

    await user.click(screen.getByRole("button", { name: "Settle to Cash" }));

    expect(saveActivitiesMock).toHaveBeenCalledWith({
      creates: [
        expect.objectContaining({
          activityType: "SELL",
          unitPrice: "10000",
        }),
      ],
    });
    expect(updateMetadataMutation).toHaveBeenCalledWith({
      assetId: "ALT-TD-1",
      metadata: expect.objectContaining({
        status: "closed",
        settlement_activity_ids: ["act-sell"],
        settled_principal: 10000,
        settled_interest: 0,
        actual_maturity_value: 10000,
      }),
    });
  });

  it("does not show settle to cash for closed deposits", () => {
    useAlternativeHoldingsMock.mockReturnValue({
      data: [
        buildHolding({
          metadata: {
            panorama_category: "time_deposit",
            sub_type: "time_deposit",
            owner: "Alice",
            provider: "HSBC",
            linked_account_id: "acc-hkd",
            principal: "10000",
            start_date: "2026-01-01",
            maturity_date: "2026-02-20",
            guaranteed_maturity_value: "10200",
            valuation_mode: "derived",
            valuation_date: "2026-02-20",
            status: "closed",
          },
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage(new Date("2026-02-21T00:00:00Z"));

    expect(screen.queryByRole("button", { name: "Settle to Cash" })).not.toBeInTheDocument();
  });
});
