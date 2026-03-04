import { render, renderHook, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useAlternativeHoldingsMock,
  useAlternativeAssetMutationsMock,
  getDynamicNavItemsMock,
  subscribeToNavigationUpdatesMock,
  useSettingsContextMock,
} = vi.hoisted(() => ({
  useAlternativeHoldingsMock: vi.fn(),
  useAlternativeAssetMutationsMock: vi.fn(),
  getDynamicNavItemsMock: vi.fn(),
  subscribeToNavigationUpdatesMock: vi.fn(),
  useSettingsContextMock: vi.fn(),
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

vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: useSettingsContextMock,
}));

import InsuranceDashboard from "./insurance-dashboard";
import { useNavigation } from "../layouts/navigation/app-navigation";

describe("insurance dashboard", () => {
  beforeEach(() => {
    getDynamicNavItemsMock.mockReturnValue([]);
    subscribeToNavigationUpdatesMock.mockReturnValue(() => {});
    useSettingsContextMock.mockReturnValue({
      settings: {
        theme: "light",
        font: "font-mono",
        baseCurrency: "USD",
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
    useSettingsContextMock.mockReset();
  });

  it("adds Insurance to primary navigation", () => {
    const { result } = renderHook(() => useNavigation());

    expect(
      result.current.primary.some((item) => item.title === "Insurance" && item.href === "/insurance"),
    ).toBe(true);
  });

  it("hides Insurance navigation when the component setting is disabled", () => {
    useSettingsContextMock.mockReturnValue({
      settings: {
        theme: "light",
        font: "font-mono",
        baseCurrency: "USD",
        instanceId: "test-instance",
        onboardingCompleted: true,
        autoUpdateCheckEnabled: true,
        menuBarVisible: true,
        syncEnabled: true,
        insuranceVisible: false,
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

    const { result } = renderHook(() => useNavigation());

    expect(result.current.primary.some((item) => item.href === "/insurance")).toBe(false);
  });

  it("renders an empty state when there are no insurance assets", () => {
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
          <InsuranceDashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Insurance" })).toBeInTheDocument();
    expect(screen.getByText("No insurance assets found.")).toBeInTheDocument();
  });
});
