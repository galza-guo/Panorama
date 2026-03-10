import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useSettingsContextMock } = vi.hoisted(() => ({
  useSettingsContextMock: vi.fn(),
}));

vi.mock("@/lib/settings-provider", () => ({
  useSettingsContext: useSettingsContextMock,
}));

import SettingsLayout from "./settings-layout";

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Routes>
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<div>Settings Home</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("settings layout", () => {
  beforeEach(() => {
    useSettingsContextMock.mockReturnValue({
      settings: {
        bucketsEnabled: false,
      },
    });
  });

  it("hides the Buckets navigation item when the feature is disabled", () => {
    renderLayout();

    expect(screen.queryByText("Buckets")).not.toBeInTheDocument();
  });

  it("shows the Buckets navigation item when the feature is enabled", () => {
    useSettingsContextMock.mockReturnValue({
      settings: {
        bucketsEnabled: true,
      },
    });

    renderLayout();

    expect(screen.getAllByText("Buckets").length).toBeGreaterThan(0);
  });
});
