import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const {
  useAccountsMock,
  useLatestValuationsMock,
  useSettingsContextMock,
  useAccountsPerformanceSummaryMock,
} = vi.hoisted(() => ({
  useAccountsMock: vi.fn(),
  useLatestValuationsMock: vi.fn(),
  useSettingsContextMock: vi.fn(),
  useAccountsPerformanceSummaryMock: vi.fn(),
}));

vi.mock("@/hooks/use-accounts", () => ({
  useAccounts: useAccountsMock,
}));

vi.mock("@/hooks/use-latest-valuations", () => ({
  useLatestValuations: useLatestValuationsMock,
}));

vi.mock("@/hooks/use-accounts-performance-summary", () => ({
  useAccountsPerformanceSummary: useAccountsPerformanceSummaryMock,
}));

vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: useSettingsContextMock,
}));

import { AccountsSummary } from "./accounts-summary";

describe("accounts summary", () => {
  it("shows holdings-mode unrealized labels and return from cost basis", async () => {
    useSettingsContextMock.mockReturnValue({
      settings: {
        baseCurrency: "USD",
      },
      accountsGrouped: false,
      setAccountsGrouped: vi.fn(),
    });

    useAccountsMock.mockReturnValue({
      accounts: [
        {
          id: "acct-1",
          name: "Brokerage",
          accountType: "INVESTMENT",
          balance: 0,
          currency: "USD",
          isDefault: false,
          isActive: true,
          isArchived: false,
          trackingMode: "HOLDINGS",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    useLatestValuationsMock.mockReturnValue({
      latestValuations: [
        {
          id: "val-1",
          accountId: "acct-1",
          valuationDate: "2026-04-08",
          accountCurrency: "USD",
          baseCurrency: "USD",
          fxRateToBase: 1,
          cashBalance: 0,
          investmentMarketValue: 1000,
          totalValue: 1000,
          costBasis: 800,
          netContribution: 0,
          calculatedAt: "2026-04-08T08:00:00Z",
        },
      ],
      isLoading: false,
      error: null,
    });

    useAccountsPerformanceSummaryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <AccountsSummary />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Unrealized P&L")).toBeInTheDocument();
    expect(screen.getByText("Unrealized Return")).toBeInTheDocument();
    expect(await screen.findByText(/25\.00%/)).toBeInTheDocument();
  });

  it("prefers valuation-based unrealized performance for holdings accounts even when a summary exists", async () => {
    useSettingsContextMock.mockReturnValue({
      settings: {
        baseCurrency: "USD",
      },
      accountsGrouped: false,
      setAccountsGrouped: vi.fn(),
    });

    useAccountsMock.mockReturnValue({
      accounts: [
        {
          id: "acct-1",
          name: "Brokerage",
          accountType: "INVESTMENT",
          balance: 0,
          currency: "USD",
          isDefault: false,
          isActive: true,
          isArchived: false,
          trackingMode: "HOLDINGS",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    useLatestValuationsMock.mockReturnValue({
      latestValuations: [
        {
          id: "val-1",
          accountId: "acct-1",
          valuationDate: "2026-04-08",
          accountCurrency: "USD",
          baseCurrency: "USD",
          fxRateToBase: 1,
          cashBalance: 0,
          investmentMarketValue: 1000,
          totalValue: 1000,
          costBasis: 800,
          netContribution: 0,
          calculatedAt: "2026-04-08T08:00:00Z",
        },
      ],
      isLoading: false,
      error: null,
    });

    useAccountsPerformanceSummaryMock.mockReturnValue({
      data: [
        {
          id: "acct-1",
          returns: [],
          periodStartDate: "2026-01-01",
          periodEndDate: "2026-04-08",
          currency: "USD",
          periodGain: 40,
          periodReturn: 0.04,
          cumulativeTwr: null,
          gainLossAmount: 40,
          annualizedTwr: null,
          simpleReturn: 0.04,
          annualizedSimpleReturn: 0,
          cumulativeMwr: null,
          annualizedMwr: null,
          volatility: 0,
          maxDrawdown: 0,
          isHoldingsMode: true,
        },
      ],
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <AccountsSummary />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Unrealized P&L")).toBeInTheDocument();
    expect(screen.getByText(/25\.00%/)).toBeInTheDocument();
    expect(screen.queryByText(/\+4\.00%/)).not.toBeInTheDocument();
  });

  it("shows transactions-mode compact performance display without labels", async () => {
    useSettingsContextMock.mockReturnValue({
      settings: {
        baseCurrency: "USD",
      },
      accountsGrouped: false,
      setAccountsGrouped: vi.fn(),
    });

    useAccountsMock.mockReturnValue({
      accounts: [
        {
          id: "acct-1",
          name: "Brokerage",
          accountType: "INVESTMENT",
          balance: 0,
          currency: "USD",
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
    });

    useLatestValuationsMock.mockReturnValue({
      latestValuations: [
        {
          id: "val-1",
          accountId: "acct-1",
          valuationDate: "2026-04-08",
          accountCurrency: "USD",
          baseCurrency: "USD",
          fxRateToBase: 1,
          cashBalance: 0,
          investmentMarketValue: 1000,
          totalValue: 1000,
          costBasis: 800,
          netContribution: 800,
          calculatedAt: "2026-04-08T08:00:00Z",
        },
      ],
      isLoading: false,
      error: null,
    });

    useAccountsPerformanceSummaryMock.mockReturnValue({
      data: [
        {
          id: "acct-1",
          returns: [],
          periodStartDate: "2026-01-01",
          periodEndDate: "2026-04-08",
          currency: "USD",
          periodGain: 200,
          periodReturn: 0.25,
          cumulativeTwr: 0.25,
          gainLossAmount: 200,
          annualizedTwr: 0.25,
          simpleReturn: 0.25,
          annualizedSimpleReturn: 0.25,
          cumulativeMwr: 0.25,
          annualizedMwr: 0.25,
          volatility: 0,
          maxDrawdown: 0,
          isHoldingsMode: false,
        },
      ],
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <AccountsSummary />
      </MemoryRouter>,
    );

    const accountRow = screen.getByText("Brokerage").closest("a");
    const returnBadge = screen.getByText(/\+25\.00%/);

    expect(screen.queryByText("Total Gain/Loss")).not.toBeInTheDocument();
    expect(screen.queryByText("Total Return")).not.toBeInTheDocument();
    expect(accountRow?.textContent).toContain("+200.00");
    expect(returnBadge.className).toContain("rounded-md");
  });

  it("uses money-weighted return for transactions accounts on dashboard", async () => {
    useSettingsContextMock.mockReturnValue({
      settings: {
        baseCurrency: "USD",
      },
      accountsGrouped: false,
      setAccountsGrouped: vi.fn(),
    });

    useAccountsMock.mockReturnValue({
      accounts: [
        {
          id: "acct-1",
          name: "Taxable",
          accountType: "INVESTMENT",
          balance: 0,
          currency: "USD",
          isDefault: false,
          isActive: true,
          isArchived: false,
          trackingMode: "TRANSACTIONS",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-04-08T00:00:00Z"),
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    useLatestValuationsMock.mockReturnValue({
      latestValuations: [
        {
          id: "val-1",
          accountId: "acct-1",
          valuationDate: "2026-04-08",
          accountCurrency: "USD",
          baseCurrency: "USD",
          fxRateToBase: 1,
          cashBalance: 0,
          investmentMarketValue: 160000,
          totalValue: 160000,
          costBasis: 150000,
          netContribution: 150000,
          calculatedAt: "2026-04-08T08:00:00Z",
        },
      ],
      isLoading: false,
      error: null,
    });

    useAccountsPerformanceSummaryMock.mockReturnValue({
      data: [
        {
          id: "acct-1",
          returns: [],
          periodStartDate: "2026-01-01",
          periodEndDate: "2026-04-08",
          currency: "USD",
          periodGain: 10000,
          periodReturn: 0.1,
          cumulativeTwr: 0,
          gainLossAmount: 10000,
          annualizedTwr: 0,
          simpleReturn: 0.1,
          annualizedSimpleReturn: 0,
          cumulativeMwr: 0.05,
          annualizedMwr: 0,
          volatility: 0,
          maxDrawdown: 0,
          isHoldingsMode: false,
        },
      ],
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <AccountsSummary />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/5\.00%/)).toBeInTheDocument();
  });
});
