import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { InsurancePolicyEditorSheet } from "./insurance-policy-editor-sheet";

describe("insurance policy editor sheet", () => {
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

  it("uses base currency defaults and cash value wording in create mode", () => {
    render(
      <InsurancePolicyEditorSheet
        open={true}
        onOpenChange={vi.fn()}
        mode="create"
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole("heading", { name: "Add Insurance Policy" })).toBeInTheDocument();
    expect(screen.getByLabelText("Currency")).toHaveValue("HKD");
    expect(screen.getByText("Cash Value")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Paying" })).toBeInTheDocument();
    expect(screen.getByText("Next Due Date")).toBeInTheDocument();
  });

  it("hides next due date when payment status is paid-up", async () => {
    const user = userEvent.setup();

    render(
      <InsurancePolicyEditorSheet
        open={true}
        onOpenChange={vi.fn()}
        mode="create"
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText("Next Due Date")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Paid-up" }));

    expect(screen.queryByText("Next Due Date")).not.toBeInTheDocument();
  });

  it("allows submit with an empty owner", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <InsurancePolicyEditorSheet
        open={true}
        onOpenChange={vi.fn()}
        mode="create"
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText("Policy Name"), "AIA Wealth Series");
    expect(screen.getByLabelText("Currency")).toHaveValue("HKD");
    await user.type(screen.getByLabelText("Cash Value"), "125000");
    await user.click(screen.getByRole("button", { name: "Create Policy" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "AIA Wealth Series",
        currency: "HKD",
        currentValue: "125000",
        owner: "",
        paymentStatus: "paying",
      }),
    );
  });
});
