import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const { useSettingsContextMock } = vi.hoisted(() => ({
  useSettingsContextMock: vi.fn(),
}));

vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: useSettingsContextMock,
}));

import SettingsLayout from "./settings-layout";

describe("settings layout", () => {
  it("hides Wealthfolio Connect from settings navigation before explicit opt-in", () => {
    useSettingsContextMock.mockReturnValue({
      settings: null,
    });

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <SettingsLayout />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Wealthfolio Connect")).not.toBeInTheDocument();
    expect(screen.getAllByText("Market Data").length).toBeGreaterThan(0);
  });

  it("hides Wealthfolio Connect from settings navigation when disabled", () => {
    useSettingsContextMock.mockReturnValue({
      settings: {
        wealthfolioConnectVisible: false,
      },
    });

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <SettingsLayout />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Wealthfolio Connect")).not.toBeInTheDocument();
    expect(screen.getAllByText("Market Data").length).toBeGreaterThan(0);
  });

  it("shows Webull HK local connect without enabling Wealthfolio Connect", () => {
    useSettingsContextMock.mockReturnValue({
      settings: null,
    });

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <SettingsLayout />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("Webull HK").length).toBeGreaterThan(0);
  });
});
