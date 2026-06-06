import type { HealthIssue, HealthStatus } from "@/lib/types";

export type HealthFixOutcome =
  | {
      kind: "fixed";
      title: "Fix applied successfully";
    }
  | {
      kind: "remaining";
      title: "Update completed, but prices still need attention";
      description: string;
    };

function affectedIds(issue: HealthIssue): Set<string> {
  return new Set(issue.affectedItems?.map((item) => item.id) ?? []);
}

function isSameIssueAfterFix(original: HealthIssue, candidate: HealthIssue): boolean {
  if (candidate.id === original.id) {
    return true;
  }

  if (candidate.category !== original.category) {
    return false;
  }

  const originalIds = affectedIds(original);
  if (originalIds.size === 0) {
    return false;
  }

  return candidate.affectedItems?.some((item) => originalIds.has(item.id)) ?? false;
}

export function getHealthFixOutcome(
  originalIssue: HealthIssue,
  statusAfterFix: HealthStatus,
): HealthFixOutcome {
  const issueStillPresent = statusAfterFix.issues.some((issue) =>
    isSameIssueAfterFix(originalIssue, issue),
  );

  if (!issueStillPresent) {
    return {
      kind: "fixed",
      title: "Fix applied successfully",
    };
  }

  return {
    kind: "remaining",
    title: "Update completed, but prices still need attention",
    description:
      "We tried to update market data, but the same price issue is still present. This can happen when a provider is delayed, unreachable, or does not have newer data yet.",
  };
}
