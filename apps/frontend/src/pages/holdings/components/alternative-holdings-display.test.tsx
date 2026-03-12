import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AlternativeAssetHolding } from "@/lib/types";

const { useBalancePrivacyMock } = vi.hoisted(() => ({
  useBalancePrivacyMock: vi.fn(),
}));

vi.mock("@/hooks/use-balance-privacy", () => ({
  useBalancePrivacy: useBalancePrivacyMock,
}));

import { AlternativeHoldingsListMobile } from "./alternative-holdings-list-mobile";
import { AlternativeHoldingsTable } from "./alternative-holdings-table";

function buildHolding(overrides: Partial<AlternativeAssetHolding> = {}): AlternativeAssetHolding {
  return {
    id: "ALT-TD-1",
    kind: "other",
    name: "HSBC 3M Deposit",
    symbol: "Other",
    currency: "HKD",
    marketValue: "10100",
    purchasePrice: "10000",
    purchaseDate: "2026-01-01",
    unrealizedGain: "100",
    unrealizedGainPct: "0.01",
    valuationDate: "2026-02-20T00:00:00Z",
    metadata: {
      panorama_category: "time_deposit",
      sub_type: "time_deposit",
      provider: "HSBC",
      principal: "10000",
      start_date: "2026-01-01",
      maturity_date: "2026-04-11",
      quoted_annual_rate: "7.3",
      valuation_mode: "derived",
    },
    ...overrides,
  };
}

describe("alternative holdings time deposit display", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-20T00:00:00Z"));
    useBalancePrivacyMock.mockReturnValue({ isBalanceHidden: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    useBalancePrivacyMock.mockReset();
  });

  it("shows days left and estimated value badge in the desktop assets table", () => {
    render(<AlternativeHoldingsTable holdings={[buildHolding()]} isLoading={false} />);

    expect(screen.getByText("50d left")).toBeInTheDocument();
    expect(screen.getByText("Est.")).toBeInTheDocument();
    expect(screen.getByTestId("desktop-time-deposit-value-ALT-TD-1")).toHaveTextContent(
      /Est\..*HK\$10,100\.00/,
    );
  });

  it("shows days left and estimated value badge in the mobile assets list", () => {
    render(<AlternativeHoldingsListMobile holdings={[buildHolding()]} isLoading={false} />);

    expect(screen.getByText("50d left")).toBeInTheDocument();
    expect(screen.getByText("Est.")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-time-deposit-value-ALT-TD-1")).toHaveTextContent(
      /Est\..*HK\$10,100\.00/,
    );
  });
});
