import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAppInfoMock, usePlatformMock, useCheckForUpdatesMock } = vi.hoisted(() => ({
  getAppInfoMock: vi.fn(),
  usePlatformMock: vi.fn(),
  useCheckForUpdatesMock: vi.fn(),
}));

vi.mock("@/adapters", () => ({
  getAppInfo: getAppInfoMock,
}));

vi.mock("@/hooks/use-platform", () => ({
  usePlatform: usePlatformMock,
}));

vi.mock("@/hooks/use-updater", () => ({
  useCheckForUpdates: useCheckForUpdatesMock,
}));

import AboutSettingsPage from "./about-page";

describe("about settings page", () => {
  beforeEach(() => {
    getAppInfoMock.mockResolvedValue({
      version: "3.0.0",
      dbPath: "/tmp/panorama.db",
      logsDir: "/tmp/logs",
    });
    usePlatformMock.mockReturnValue({ isMobile: false });
    useCheckForUpdatesMock.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  it("renders panorama branding and repository links", async () => {
    render(
      <MemoryRouter>
        <AboutSettingsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Panorama")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Panorama is a local-first personal finance and investment tracker focused on broad HK/CN coverage.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Project Home" })).toHaveAttribute(
      "href",
      "https://github.com/galza-guo/Panorama",
    );
    expect(
      screen
        .getAllByRole("link", { name: "Repository" })
        .every((link) => link.getAttribute("href") === "https://github.com/galza-guo/Panorama"),
    ).toBe(true);
    expect(screen.getByRole("link", { name: "Report Issue" })).toHaveAttribute(
      "href",
      "https://github.com/galza-guo/Panorama/issues",
    );
    expect(screen.getByRole("link", { name: "Upstream Wealthfolio" })).toHaveAttribute(
      "href",
      "https://github.com/afadil/wealthfolio",
    );
  });
});
