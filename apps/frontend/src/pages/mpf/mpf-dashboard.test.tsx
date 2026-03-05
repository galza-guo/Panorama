import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useAlternativeHoldingsMock, useAlternativeAssetMutationsMock, useSettingsContextMock } =
  vi.hoisted(() => ({
    useAlternativeHoldingsMock: vi.fn(),
    useAlternativeAssetMutationsMock: vi.fn(),
    useSettingsContextMock: vi.fn(),
  }));

vi.mock("@/hooks/use-alternative-assets", () => ({
  useAlternativeHoldings: useAlternativeHoldingsMock,
}));

vi.mock("@/pages/asset/alternative-assets/hooks", () => ({
  useAlternativeAssetMutations: useAlternativeAssetMutationsMock,
}));

vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: useSettingsContextMock,
}));

import MpfDashboard from "./mpf-dashboard";

describe("mpf dashboard", () => {
  beforeEach(() => {
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
    useSettingsContextMock.mockReset();
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
