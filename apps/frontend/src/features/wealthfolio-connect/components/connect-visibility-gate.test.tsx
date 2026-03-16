import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const { useSettingsContextMock } = vi.hoisted(() => ({
  useSettingsContextMock: vi.fn(),
}));

vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: useSettingsContextMock,
}));

import { ConnectVisibilityGate } from "./connect-visibility-gate";

describe("connect visibility gate", () => {
  it("redirects away from hidden connect routes", () => {
    useSettingsContextMock.mockReturnValue({
      settings: {
        wealthfolioConnectVisible: false,
      },
    });

    render(
      <MemoryRouter initialEntries={["/connect"]}>
        <Routes>
          <Route
            path="/connect"
            element={
              <ConnectVisibilityGate redirectTo="/settings/general">
                <div>Connect Page</div>
              </ConnectVisibilityGate>
            }
          />
          <Route path="/settings/general" element={<div>General Settings</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText("Connect Page")).not.toBeInTheDocument();
    expect(screen.getByText("General Settings")).toBeInTheDocument();
  });
});
