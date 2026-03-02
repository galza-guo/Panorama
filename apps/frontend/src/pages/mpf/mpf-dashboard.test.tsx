import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useAlternativeHoldingsMock,
  useAlternativeAssetMutationsMock,
  getDynamicNavItemsMock,
  subscribeToNavigationUpdatesMock,
} = vi.hoisted(() => ({
  useAlternativeHoldingsMock: vi.fn(),
  useAlternativeAssetMutationsMock: vi.fn(),
  getDynamicNavItemsMock: vi.fn(),
  subscribeToNavigationUpdatesMock: vi.fn(),
}));

vi.mock("@/hooks/use-alternative-assets", () => ({
  useAlternativeHoldings: useAlternativeHoldingsMock,
}));

vi.mock("@/pages/asset/alternative-assets/hooks", () => ({
  useAlternativeAssetMutations: useAlternativeAssetMutationsMock,
}));

vi.mock("@/addons/addons-runtime-context", () => ({
  getDynamicNavItems: getDynamicNavItemsMock,
  subscribeToNavigationUpdates: subscribeToNavigationUpdatesMock,
}));

import MpfDashboard from "./mpf-dashboard";
import { useNavigation } from "../layouts/navigation/app-navigation";

describe("mpf dashboard", () => {
  beforeEach(() => {
    getDynamicNavItemsMock.mockReturnValue([]);
    subscribeToNavigationUpdatesMock.mockReturnValue(() => {});
    useAlternativeAssetMutationsMock.mockReturnValue({
      createMutation: { isPending: false, mutateAsync: vi.fn() },
      updateMetadataMutation: { isPending: false, mutateAsync: vi.fn() },
      updateValuationMutation: { isPending: false, mutateAsync: vi.fn() },
    });
  });

  afterEach(() => {
    useAlternativeHoldingsMock.mockReset();
    useAlternativeAssetMutationsMock.mockReset();
    getDynamicNavItemsMock.mockReset();
    subscribeToNavigationUpdatesMock.mockReset();
  });

  it("adds MPF to primary navigation", () => {
    const { result } = renderHook(() => useNavigation());

    expect(result.current.primary.some((item) => item.title === "MPF" && item.href === "/mpf")).toBe(
      true,
    );
  });

  it("renders an empty state when there are no mpf assets", () => {
    useAlternativeHoldingsMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });

    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MpfDashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "MPF" })).toBeInTheDocument();
    expect(screen.getByText("No MPF assets found.")).toBeInTheDocument();
  });
});
