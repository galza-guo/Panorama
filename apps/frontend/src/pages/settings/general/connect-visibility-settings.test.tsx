import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { useSettingsContextMock } = vi.hoisted(() => ({
  useSettingsContextMock: vi.fn(),
}));

vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: useSettingsContextMock,
}));

import { ConnectVisibilitySettings } from "./connect-visibility-settings";

describe("connect visibility settings", () => {
  it("toggles Wealthfolio Connect visibility", async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    useSettingsContextMock.mockReturnValue({
      settings: {
        theme: "light",
        font: "font-mono",
        baseCurrency: "USD",
        instanceId: "instance",
        onboardingCompleted: true,
        autoUpdateCheckEnabled: true,
        menuBarVisible: true,
        syncEnabled: true,
        insuranceVisible: true,
        mpfVisible: true,
        wealthfolioConnectVisible: true,
      },
      isLoading: false,
      isError: false,
      updateBaseCurrency: vi.fn(),
      updateSettings,
      refetch: vi.fn(),
      accountsGrouped: true,
      setAccountsGrouped: vi.fn(),
    });

    render(<ConnectVisibilitySettings />);

    await user.click(screen.getByRole("switch", { name: /show wealthfolio connect/i }));

    expect(updateSettings).toHaveBeenCalledWith({ wealthfolioConnectVisible: false });
  });
});
