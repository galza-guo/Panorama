import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryKeys } from "@/lib/query-keys";

const {
  getBucketsMock,
  createBucketMock,
  updateBucketMock,
  deleteBucketMock,
  getBucketAccountDefaultsMock,
  assignBucketAccountDefaultMock,
  removeBucketAccountDefaultMock,
  getBucketHoldingOverridesMock,
  assignBucketHoldingOverrideMock,
  removeBucketHoldingOverrideMock,
  getBucketAssetAssignmentsMock,
  assignBucketAssetMock,
  removeBucketAssetAssignmentMock,
  getBucketAllocationMock,
  useSettingsContextMock,
} = vi.hoisted(() => ({
  getBucketsMock: vi.fn(),
  createBucketMock: vi.fn(),
  updateBucketMock: vi.fn(),
  deleteBucketMock: vi.fn(),
  getBucketAccountDefaultsMock: vi.fn(),
  assignBucketAccountDefaultMock: vi.fn(),
  removeBucketAccountDefaultMock: vi.fn(),
  getBucketHoldingOverridesMock: vi.fn(),
  assignBucketHoldingOverrideMock: vi.fn(),
  removeBucketHoldingOverrideMock: vi.fn(),
  getBucketAssetAssignmentsMock: vi.fn(),
  assignBucketAssetMock: vi.fn(),
  removeBucketAssetAssignmentMock: vi.fn(),
  getBucketAllocationMock: vi.fn(),
  useSettingsContextMock: vi.fn(),
}));

vi.mock("@/adapters", () => ({
  getBuckets: getBucketsMock,
  createBucket: createBucketMock,
  updateBucket: updateBucketMock,
  deleteBucket: deleteBucketMock,
  getBucketAccountDefaults: getBucketAccountDefaultsMock,
  assignBucketAccountDefault: assignBucketAccountDefaultMock,
  removeBucketAccountDefault: removeBucketAccountDefaultMock,
  getBucketHoldingOverrides: getBucketHoldingOverridesMock,
  assignBucketHoldingOverride: assignBucketHoldingOverrideMock,
  removeBucketHoldingOverride: removeBucketHoldingOverrideMock,
  getBucketAssetAssignments: getBucketAssetAssignmentsMock,
  assignBucketAsset: assignBucketAssetMock,
  removeBucketAssetAssignment: removeBucketAssetAssignmentMock,
  getBucketAllocation: getBucketAllocationMock,
}));

vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: useSettingsContextMock,
}));

import {
  useAssignBucketHoldingOverride,
  useBucketAllocation,
  useBucketResolution,
} from "./use-buckets";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  Wrapper.displayName = "BucketsTestWrapper";
  return { Wrapper, queryClient };
}

describe("useBuckets", () => {
  beforeEach(() => {
    const timestamp = "2026-03-09T00:00:00Z";

    getBucketsMock.mockResolvedValue([
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
        id: "stable",
        name: "Stable",
        color: "#22c55e",
        targetPercent: 30,
        sortOrder: 10,
        isSystem: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "growth",
        name: "Growth",
        color: "#3b82f6",
        targetPercent: 70,
        sortOrder: 20,
        isSystem: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);

    getBucketAccountDefaultsMock.mockResolvedValue([
      {
        id: "acct-default-1",
        accountId: "account-1",
        bucketId: "growth",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);

    getBucketHoldingOverridesMock.mockResolvedValue([
      {
        id: "holding-override-1",
        accountId: "account-1",
        assetId: "asset-1",
        bucketId: "stable",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);

    getBucketAssetAssignmentsMock.mockResolvedValue([
      {
        id: "asset-assignment-1",
        assetId: "asset-2",
        bucketId: "stable",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);

    assignBucketHoldingOverrideMock.mockResolvedValue({
      id: "holding-override-1",
      accountId: "account-1",
      assetId: "asset-1",
      bucketId: "stable",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    getBucketAllocationMock.mockResolvedValue({
      accountId: "account-1",
      currency: "USD",
      totalValue: 1000,
      buckets: [
        {
          bucketId: "stable",
          bucketName: "Stable",
          color: "#22c55e",
          currentAmount: 400,
          currentPercent: 40,
          targetPercent: 30,
          deviationPercent: 10,
        },
        {
          bucketId: "growth",
          bucketName: "Growth",
          color: "#3b82f6",
          currentAmount: 600,
          currentPercent: 60,
          targetPercent: 70,
          deviationPercent: -10,
        },
      ],
    });

    useSettingsContextMock.mockReturnValue({
      settings: {
        theme: "light",
        font: "font-mono",
        baseCurrency: "USD",
        instanceId: "instance-1",
        onboardingCompleted: true,
        autoUpdateCheckEnabled: true,
        menuBarVisible: true,
        syncEnabled: true,
        insuranceVisible: true,
        mpfVisible: true,
        bucketsEnabled: true,
      },
    });
  });

  it("resolves buckets using holding override, account default, and unassigned fallback", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useBucketResolution(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.resolveAccountBucket("account-1")?.id).toBe("growth");
    expect(result.current.resolveHoldingBucket("account-1", "asset-1")?.id).toBe("stable");
    expect(result.current.resolveHoldingBucket("account-1", "asset-9")?.id).toBe("growth");
    expect(result.current.resolveAssetBucket("asset-2")?.id).toBe("stable");
    expect(result.current.resolveAssetBucket("asset-404")?.id).toBe("unassigned");
  });

  it("invalidates holdings and bucket allocation queries after assigning a holding override", async () => {
    const { Wrapper, queryClient } = createWrapper();

    queryClient.setQueryData([QueryKeys.HOLDINGS, "account-1"], [{ id: "asset-1" }]);
    queryClient.setQueryData(QueryKeys.bucketAllocation("account-1", "USD"), {
      accountId: "account-1",
    });

    const { result } = renderHook(() => useAssignBucketHoldingOverride(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        accountId: "account-1",
        assetId: "asset-1",
        bucketId: "stable",
      });
    });

    expect(assignBucketHoldingOverrideMock).toHaveBeenCalledWith({
      accountId: "account-1",
      assetId: "asset-1",
      bucketId: "stable",
    });
    expect(queryClient.getQueryState([QueryKeys.HOLDINGS, "account-1"])?.isInvalidated).toBe(true);
    expect(
      queryClient.getQueryState(QueryKeys.bucketAllocation("account-1", "USD"))?.isInvalidated,
    ).toBe(true);
  });

  it("loads bucket allocation with an account-specific query key", async () => {
    const { Wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useBucketAllocation("account-1", "USD"), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getBucketAllocationMock).toHaveBeenCalledWith("account-1", "USD");
    expect(queryClient.getQueryData(QueryKeys.bucketAllocation("account-1", "USD"))).toEqual(
      expect.objectContaining({
        accountId: "account-1",
        currency: "USD",
      }),
    );
  });
});
