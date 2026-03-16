import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const { useAggregatedSyncStatusMock, useSettingsContextMock } = vi.hoisted(() => ({
  useAggregatedSyncStatusMock: vi.fn(),
  useSettingsContextMock: vi.fn(),
}));

vi.mock("@/features/wealthfolio-connect/hooks", () => ({
  useAggregatedSyncStatus: useAggregatedSyncStatusMock,
}));

vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: useSettingsContextMock,
}));

import { ConnectNavItem } from "./connect-nav-item";

describe("connect nav item", () => {
  it("does not render when Wealthfolio Connect visibility is disabled", () => {
    useAggregatedSyncStatusMock.mockReturnValue({
      status: "idle",
      lastSyncTime: null,
    });
    useSettingsContextMock.mockReturnValue({
      settings: {
        wealthfolioConnectVisible: false,
      },
    });

    render(
      <MemoryRouter>
        <ConnectNavItem collapsed={false} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: /connect/i })).not.toBeInTheDocument();
  });
});
