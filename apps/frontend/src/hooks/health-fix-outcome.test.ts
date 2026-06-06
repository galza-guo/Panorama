import { describe, expect, it } from "vitest";
import type { HealthIssue, HealthStatus } from "@/lib/types";
import { getHealthFixOutcome } from "./health-fix-outcome";

const baseIssue: HealthIssue = {
  id: "price_stale:warning:abc",
  severity: "WARNING",
  category: "PRICE_STALENESS",
  title: "Price updates needed for 1 holding",
  message: "Some holdings haven't had prices updated recently. Consider syncing prices.",
  affectedCount: 1,
  affectedItems: [{ id: "AAPL", name: "Apple Inc.", symbol: "AAPL" }],
  fixAction: { id: "sync_prices", label: "Sync Prices", payload: ["AAPL"] },
  dataHash: "abc",
  timestamp: "2026-06-05T00:00:00Z",
};

function statusWithIssues(issues: HealthIssue[]): HealthStatus {
  return {
    overallSeverity: issues.length > 0 ? "WARNING" : "INFO",
    issueCounts: issues.length > 0 ? { WARNING: issues.length } : {},
    issues,
    checkedAt: "2026-06-05T00:00:01Z",
    isStale: false,
  };
}

describe("getHealthFixOutcome", () => {
  it("reports fixed when the original issue is gone", () => {
    expect(getHealthFixOutcome(baseIssue, statusWithIssues([]))).toEqual({
      kind: "fixed",
      title: "Fix applied successfully",
    });
  });

  it("does not report success when the same issue remains", () => {
    expect(getHealthFixOutcome(baseIssue, statusWithIssues([baseIssue]))).toEqual({
      kind: "remaining",
      title: "Update completed, but prices still need attention",
      description:
        "We tried to update market data, but the same price issue is still present. This can happen when a provider is delayed, unreachable, or does not have newer data yet.",
    });
  });

  it("matches a regenerated issue that still affects the same asset", () => {
    const regeneratedIssue: HealthIssue = {
      ...baseIssue,
      id: "price_stale:warning:def",
      dataHash: "def",
    };

    expect(getHealthFixOutcome(baseIssue, statusWithIssues([regeneratedIssue])).kind).toBe(
      "remaining",
    );
  });
});
