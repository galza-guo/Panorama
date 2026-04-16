import { describe, expect, it } from "vitest";
import {
  createActivityAmountFormatter,
  createActivityQuantityFormatter,
  formatActivityAmount,
  formatActivityDate,
  formatActivityQuantity,
  formatActivityType,
  getActivityTypeBadge,
} from "./activity-table-utils";

describe("activity-table-utils", () => {
  it("maps BUY activities to the upstream success badge", () => {
    expect(getActivityTypeBadge("BUY")).toEqual({
      variant: "success",
      className: "rounded-sm",
    });
  });

  it("formats activity labels and dates for display", () => {
    expect(formatActivityType("TRANSFER_IN")).toBe("TRANSFER IN");
    expect(formatActivityDate("2026-01-17")).toBe("Jan 17, 2026");
    expect(formatActivityDate("not-a-date")).toBe("not-a-date");
  });

  it("formats amounts using absolute values and privacy masking", () => {
    const formatter = createActivityAmountFormatter();

    expect(formatActivityAmount(-12, formatter, false, "USD")).toBe("12.00 USD");
    expect(formatActivityAmount(12, formatter, true, "USD")).toBe("******");
    expect(formatActivityAmount(undefined, formatter, false, "USD")).toBe("-");
  });

  it("formats quantities with shared rounding and privacy masking", () => {
    const formatter = createActivityQuantityFormatter();

    expect(formatActivityQuantity(1.23456, formatter, false)).toBe("1.2346");
    expect(formatActivityQuantity(1.23456, formatter, true)).toBe("***");
    expect(formatActivityQuantity(undefined, formatter, false)).toBe("-");
  });
});
