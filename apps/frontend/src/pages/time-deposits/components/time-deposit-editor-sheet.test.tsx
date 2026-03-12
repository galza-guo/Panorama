import userEvent from "@testing-library/user-event";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AlternativeAssetHolding } from "@/lib/types";

const { useSettingsContextMock } = vi.hoisted(() => ({
  useSettingsContextMock: vi.fn(),
}));

vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: useSettingsContextMock,
}));

vi.mock("@wealthfolio/ui", async () => {
  const actual = await vi.importActual<typeof import("@wealthfolio/ui")>("@wealthfolio/ui");

  return {
    ...actual,
    CurrencyInput: ({
      value,
      onChange,
    }: {
      value?: string;
      onChange: (value: string) => void;
    }) => (
      <input
        aria-label="Currency"
        data-testid="mock-currency-input"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    ),
    DatePickerInput: ({
      value,
      onChange,
    }: {
      value?: Date | null;
      onChange: (date: Date | null) => void;
    }) => (
      <input
        data-testid="mock-date-picker"
        type="date"
        value={value ? value.toISOString().slice(0, 10) : ""}
        onChange={(event) =>
          onChange(event.target.value ? new Date(`${event.target.value}T00:00:00Z`) : null)
        }
      />
    ),
  };
});

import { TimeDepositEditorSheet } from "./time-deposit-editor-sheet";

const TODAY = new Date("2026-02-20T00:00:00Z");

function buildHolding(
  overrides: Partial<AlternativeAssetHolding> = {},
): AlternativeAssetHolding {
  return {
    id: "ALT-TD-1",
    kind: "other",
    name: "HSBC 3M Deposit",
    symbol: "Time Deposit",
    currency: "HKD",
    marketValue: "10123.45",
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
      valuation_mode: "manual",
      current_value_override: "10123.45",
      valuation_date: "2026-02-20",
      status: "active",
    },
    ...overrides,
  };
}

function setDate(containerTestId: string, value: string) {
  fireEvent.change(within(screen.getByTestId(containerTestId)).getByTestId("mock-date-picker"), {
    target: { value },
  });
}

describe("time deposit editor sheet", () => {
  beforeEach(() => {
    useSettingsContextMock.mockReturnValue({
      settings: {
        theme: "light",
        font: "font-mono",
        baseCurrency: "HKD",
        instanceId: "test-instance",
        onboardingCompleted: true,
        autoUpdateCheckEnabled: true,
        menuBarVisible: true,
        syncEnabled: true,
        insuranceVisible: true,
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
  });

  afterEach(() => {
    useSettingsContextMock.mockReset();
  });

  it("uses base currency defaults in create mode", () => {
    render(
      <TimeDepositEditorSheet
        open={true}
        onOpenChange={vi.fn()}
        mode="create"
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        today={TODAY}
      />,
    );

    expect(screen.getByRole("heading", { name: "Add Time Deposit" })).toBeInTheDocument();
    expect(screen.getByLabelText("Currency")).toHaveValue("HKD");
    expect(screen.queryByText("Valuation Date")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Manual Current Value")).not.toBeInTheDocument();
  });

  it("loads existing holding values in edit mode", () => {
    render(
      <TimeDepositEditorSheet
        open={true}
        onOpenChange={vi.fn()}
        mode="edit"
        holding={buildHolding()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        today={TODAY}
      />,
    );

    expect(screen.getByLabelText("Deposit Name")).toHaveValue("HSBC 3M Deposit");
    expect(screen.getByLabelText("Provider")).toHaveValue("HSBC");
    expect(screen.getByLabelText("Owner")).toHaveValue("Alice");
    expect(screen.getByLabelText("Principal")).toHaveValue("10000");
    expect(screen.getByLabelText("Quoted Annual Rate (%)")).toHaveValue("7.3");
    expect(screen.getByLabelText("Manual Current Value")).toHaveValue("10123.45");
  });

  it("updates rate-driven previews", async () => {
    const user = userEvent.setup();

    render(
      <TimeDepositEditorSheet
        open={true}
        onOpenChange={vi.fn()}
        mode="create"
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        today={TODAY}
      />,
    );

    await user.type(screen.getByLabelText("Deposit Name"), "HSBC 3M Deposit");
    await user.clear(screen.getByLabelText("Principal"));
    await user.type(screen.getByLabelText("Principal"), "10000");
    await user.clear(screen.getByLabelText("Quoted Annual Rate (%)"));
    await user.type(screen.getByLabelText("Quoted Annual Rate (%)"), "7.3");

    setDate("start-date-field", "2026-01-01");
    setDate("maturity-date-field", "2026-04-11");
    expect(screen.getByTestId("preview-maturity-value")).toHaveTextContent("10200.00");
    expect(screen.getByTestId("preview-current-value")).toHaveTextContent("10100.00");
  });

  it("updates maturity-driven previews", async () => {
    const user = userEvent.setup();

    render(
      <TimeDepositEditorSheet
        open={true}
        onOpenChange={vi.fn()}
        mode="create"
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        today={TODAY}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Known Maturity Value" }));
    await user.type(screen.getByLabelText("Deposit Name"), "HSBC 3M Deposit");
    await user.clear(screen.getByLabelText("Principal"));
    await user.type(screen.getByLabelText("Principal"), "10000");
    await user.clear(screen.getByLabelText("Guaranteed Maturity Value"));
    await user.type(screen.getByLabelText("Guaranteed Maturity Value"), "10200");

    setDate("start-date-field", "2026-01-01");
    setDate("maturity-date-field", "2026-04-11");
    expect(screen.getByTestId("preview-annualized-return")).toHaveTextContent("7.30%");
    expect(screen.getByTestId("preview-current-value")).toHaveTextContent("10100.00");
  });

  it("shows manual current value fields when manual mode is enabled", async () => {
    const user = userEvent.setup();

    render(
      <TimeDepositEditorSheet
        open={true}
        onOpenChange={vi.fn()}
        mode="create"
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        today={TODAY}
      />,
    );

    expect(screen.queryByLabelText("Manual Current Value")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Use manual current value"));

    expect(screen.getByLabelText("Manual Current Value")).toBeInTheDocument();
  });

  it("validates required fields before submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <TimeDepositEditorSheet
        open={true}
        onOpenChange={vi.fn()}
        mode="create"
        onSubmit={onSubmit}
        today={TODAY}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create Time Deposit" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Deposit name is required.")).toBeInTheDocument();
  });

  it("allows owner to be left blank", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <TimeDepositEditorSheet
        open={true}
        onOpenChange={vi.fn()}
        mode="create"
        onSubmit={onSubmit}
        today={TODAY}
      />,
    );

    await user.type(screen.getByLabelText("Deposit Name"), "HSBC 3M Deposit");
    await user.clear(screen.getByLabelText("Principal"));
    await user.type(screen.getByLabelText("Principal"), "10000");
    await user.clear(screen.getByLabelText("Quoted Annual Rate (%)"));
    await user.type(screen.getByLabelText("Quoted Annual Rate (%)"), "7.3");

    setDate("start-date-field", "2026-01-01");
    setDate("maturity-date-field", "2026-04-11");
    await user.click(screen.getByRole("button", { name: "Create Time Deposit" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "",
      }),
    );
  });
});
