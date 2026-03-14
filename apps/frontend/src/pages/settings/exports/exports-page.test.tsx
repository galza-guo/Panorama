import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const { FolderSyncCardMock } = vi.hoisted(() => ({
  FolderSyncCardMock: vi.fn(() => <div>Folder Sync Card</div>),
}));

vi.mock("@/features/folder-sync/components/folder-sync-card", () => ({
  FolderSyncCard: FolderSyncCardMock,
}));

vi.mock("./backup-restore-form", () => ({
  BackupRestoreForm: () => <div>Backup Restore Form</div>,
}));

vi.mock("./exports-form", () => ({
  ExportForm: () => <div>Export Form</div>,
}));

import ExportSettingsPage from "./exports-page";

describe("export settings page", () => {
  it("renders backup, sync, and export tabs", () => {
    render(
      <MemoryRouter>
        <ExportSettingsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Backup, Sync & Export")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Backup & Restore" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sync" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Data Export" })).toBeInTheDocument();
  });

  it("shows folder sync content in the sync tab", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ExportSettingsPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("tab", { name: "Sync" }));

    expect(screen.getByText("Folder Sync Card")).toBeInTheDocument();
  });
});
