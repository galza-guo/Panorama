import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useBucketsMock,
  useBucketAccountDefaultsMock,
  useBucketHoldingOverridesMock,
  useBucketAssetAssignmentsMock,
  useAccountsMock,
  useAlternativeHoldingsMock,
  useQueriesMock,
} = vi.hoisted(() => ({
  useBucketsMock: vi.fn(),
  useBucketAccountDefaultsMock: vi.fn(),
  useBucketHoldingOverridesMock: vi.fn(),
  useBucketAssetAssignmentsMock: vi.fn(),
  useAccountsMock: vi.fn(),
  useAlternativeHoldingsMock: vi.fn(),
  useQueriesMock: vi.fn(),
}));

vi.mock("@/hooks/use-buckets", () => ({
  useBuckets: useBucketsMock,
  useBucketAccountDefaults: useBucketAccountDefaultsMock,
  useBucketHoldingOverrides: useBucketHoldingOverridesMock,
  useBucketAssetAssignments: useBucketAssetAssignmentsMock,
  useCreateBucket: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateBucket: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteBucket: () => ({ mutate: vi.fn() }),
  useAssignBucketAccountDefault: () => ({ mutateAsync: vi.fn() }),
  useRemoveBucketAccountDefault: () => ({ mutateAsync: vi.fn() }),
  useAssignBucketHoldingOverride: () => ({ mutateAsync: vi.fn() }),
  useRemoveBucketHoldingOverride: () => ({ mutateAsync: vi.fn() }),
  useAssignBucketAsset: () => ({ mutateAsync: vi.fn() }),
  useRemoveBucketAssetAssignment: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/use-accounts", () => ({
  useAccounts: useAccountsMock,
}));

vi.mock("@/hooks/use-alternative-assets", () => ({
  useAlternativeHoldings: useAlternativeHoldingsMock,
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );

  return {
    ...actual,
    useQueries: useQueriesMock,
  };
});

import BucketsPage from "./buckets-page";

describe("BucketsPage", () => {
  beforeEach(() => {
    const timestamp = "2026-03-10T00:00:00Z";

    useBucketsMock.mockReturnValue({
      data: [
        {
          id: "unassigned",
          name: "Unassigned",
          color: "#94a3b8",
          targetPercent: null,
          sortOrder: 0,
          isSystem: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: "growth",
          name: "Growth",
          color: "#3b82f6",
          targetPercent: 70,
          sortOrder: 10,
          isSystem: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      isLoading: false,
    });

    useBucketAccountDefaultsMock.mockReturnValue({ data: [], isLoading: false });
    useBucketHoldingOverridesMock.mockReturnValue({ data: [], isLoading: false });
    useBucketAssetAssignmentsMock.mockReturnValue({ data: [], isLoading: false });

    useAccountsMock.mockReturnValue({
      accounts: [
        {
          id: "account-1",
          name: "Brokerage",
          accountType: "SECURITIES",
          balance: 0,
          currency: "USD",
          isDefault: false,
          isActive: true,
          isArchived: false,
          trackingMode: "TRANSACTIONS",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      isLoading: false,
    });

    useAlternativeHoldingsMock.mockReturnValue({
      data: [
        {
          id: "asset-1",
          kind: "property",
          name: "Apartment",
          symbol: "Property",
          currency: "USD",
          marketValue: "1000",
          valuationDate: timestamp,
        },
      ],
      isLoading: false,
    });

    useQueriesMock.mockReturnValue([
      {
        data: [
          {
            id: "holding-1",
            holdingType: "INVESTMENT",
            accountId: "account-1",
            instrument: {
              id: "AAPL:XNAS",
              symbol: "AAPL",
              name: "Apple",
            },
            localCurrency: "USD",
            baseCurrency: "USD",
            quantity: 1,
            marketValue: { local: 100, base: 100 },
            weight: 10,
            asOfDate: timestamp,
          },
        ],
        isLoading: false,
      },
    ]);
  });

  it("uses fixed-height internal scroll areas for long assignment lists", () => {
    render(
      <MemoryRouter>
        <BucketsPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("bucket-account-defaults-scroll")).toHaveClass("h-[420px]");
    expect(screen.getByTestId("bucket-standalone-assets-scroll")).toHaveClass("h-[420px]");
  });

  it("stacks assignment management cards vertically", () => {
    render(
      <MemoryRouter>
        <BucketsPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("bucket-assignment-sections")).toHaveClass("space-y-6");
    expect(screen.getByTestId("bucket-assignment-sections")).not.toHaveClass("xl:grid-cols-2");
  });

  it("collapses investment overrides by default and expands on demand", () => {
    render(
      <MemoryRouter>
        <BucketsPage />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("bucket-investment-overrides-scroll")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show investment overrides/i }));

    expect(screen.getByTestId("bucket-investment-overrides-scroll")).toHaveClass("h-[420px]");

    fireEvent.click(screen.getByRole("button", { name: /hide investment overrides/i }));

    expect(screen.queryByTestId("bucket-investment-overrides-scroll")).not.toBeInTheDocument();
  });

  it("uses a narrower selector width for investment overrides", () => {
    render(
      <MemoryRouter>
        <BucketsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /show investment overrides/i }));

    expect(screen.getByTestId("bucket-investment-override-control")).toHaveClass("sm:w-52");
    expect(screen.getByTestId("bucket-investment-override-control")).not.toHaveClass("sm:w-60");
  });
});
