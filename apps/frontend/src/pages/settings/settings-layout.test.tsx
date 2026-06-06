import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import SettingsLayout from "./settings-layout";

describe("settings layout", () => {
  it("does not show Wealthfolio Connect in settings navigation", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <SettingsLayout />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Wealthfolio Connect")).not.toBeInTheDocument();
    expect(screen.getAllByText("Market Data").length).toBeGreaterThan(0);
  });

  it("shows Webull HK local connect without enabling Wealthfolio Connect", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <SettingsLayout />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("Webull HK").length).toBeGreaterThan(0);
  });
});
