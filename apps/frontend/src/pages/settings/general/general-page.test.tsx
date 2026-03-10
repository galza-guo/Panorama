import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { usePlatformMock, useSettingsContextMock, BaseCurrencySettingsMock } = vi.hoisted(() => ({
  usePlatformMock: vi.fn(),
  useSettingsContextMock: vi.fn(),
  BaseCurrencySettingsMock: vi.fn(() => <div>Base Currency Settings</div>),
}));

vi.mock("@/hooks/use-platform", () => ({
  usePlatform: usePlatformMock,
}));

vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: useSettingsContextMock,
}));

vi.mock("./currency-settings", () => ({
  BaseCurrencySettings: BaseCurrencySettingsMock,
}));

vi.mock("./exchange-rates/exchange-rates-settings", () => ({
  ExchangeRatesSettings: () => <div>Exchange Rates Settings</div>,
}));

vi.mock("./auto-update-settings", () => ({
  AutoUpdateSettings: () => <div>Auto Update Settings</div>,
}));

import GeneralSettingsPage from "./general-page";

describe("general settings page", () => {
  const updateSettings = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    updateSettings.mockClear();
    usePlatformMock.mockReturnValue({ isMobile: false });
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
        bucketsEnabled: false,
      },
      updateSettings,
    });
  });

  it("renders an enable buckets switch when the feature is available", () => {
    render(
      <MemoryRouter>
        <GeneralSettingsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("switch", { name: /enable buckets/i })).toBeInTheDocument();
    expect(
      screen.getByText("Turn on the Buckets module and reveal bucket labels and insights."),
    ).toBeInTheDocument();
  });

  it("updates bucketsEnabled when the switch is toggled", () => {
    render(
      <MemoryRouter>
        <GeneralSettingsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("switch", { name: /enable buckets/i }));

    expect(updateSettings).toHaveBeenCalledWith({ bucketsEnabled: true });
  });
});
