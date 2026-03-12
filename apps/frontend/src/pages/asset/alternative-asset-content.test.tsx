import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AlternativeAssetHolding } from "@/lib/types";

import { getDetailRows } from "./alternative-asset-content";

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
});
