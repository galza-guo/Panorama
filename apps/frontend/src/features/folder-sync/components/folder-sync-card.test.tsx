import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useFolderSyncMock,
  initializeMock,
  joinMock,
  retryNowMock,
  disableMock,
  refreshMock,
  selectSharedFolderMock,
} = vi.hoisted(() => ({
  useFolderSyncMock: vi.fn(),
  initializeMock: vi.fn(),
  joinMock: vi.fn(),
  retryNowMock: vi.fn(),
  disableMock: vi.fn(),
  refreshMock: vi.fn(),
  selectSharedFolderMock: vi.fn(),
}));

vi.mock("../hooks/use-folder-sync", () => ({
  useFolderSync: useFolderSyncMock,
}));

import { FolderSyncCard } from "./folder-sync-card";

describe("folder sync card", () => {
  beforeEach(() => {
    initializeMock.mockResolvedValue({ status: "initialized" });
    joinMock.mockResolvedValue({ status: "joined" });
    retryNowMock.mockResolvedValue({ status: "ok" });
    disableMock.mockResolvedValue({ status: "disabled" });
    refreshMock.mockResolvedValue(undefined);
    selectSharedFolderMock.mockResolvedValue("/tmp/PanoramaSync");

    useFolderSyncMock.mockReturnValue({
      isLoading: false,
      state: {
        config: {
          sharedFolderPath: "/tmp/PanoramaSync",
          deviceId: "device-a",
          isEnabled: true,
          initializedAt: "2026-03-07T18:00:00Z",
          createdAt: "2026-03-07T18:00:00Z",
          updatedAt: "2026-03-07T18:00:00Z",
        },
        status: {
          syncState: "up_to_date",
          lastCheckedAt: "2026-03-07T18:10:00Z",
          lastSuccessfulSyncAt: "2026-03-07T18:10:00Z",
          lastLocalExportAt: "2026-03-07T18:09:00Z",
          lastRemoteApplyAt: "2026-03-07T18:08:00Z",
          lastError: null,
          updatedAt: "2026-03-07T18:10:00Z",
        },
        history: [
          {
            id: 1,
            eventType: "import",
            status: "success",
            message: "Imported 1 remote event(s), skipped 0",
            eventId: "evt-1",
            sourceDeviceId: "device-b",
            createdAt: "2026-03-07T18:08:00Z",
          },
        ],
      },
      config: {
        sharedFolderPath: "/tmp/PanoramaSync",
        deviceId: "device-a",
        isEnabled: true,
        initializedAt: "2026-03-07T18:00:00Z",
        createdAt: "2026-03-07T18:00:00Z",
        updatedAt: "2026-03-07T18:00:00Z",
      },
      status: {
        syncState: "up_to_date",
        lastCheckedAt: "2026-03-07T18:10:00Z",
        lastSuccessfulSyncAt: "2026-03-07T18:10:00Z",
        lastLocalExportAt: "2026-03-07T18:09:00Z",
        lastRemoteApplyAt: "2026-03-07T18:08:00Z",
        lastError: null,
        updatedAt: "2026-03-07T18:10:00Z",
      },
      history: [
        {
          id: 1,
          eventType: "import",
          status: "success",
          message: "Imported 1 remote event(s), skipped 0",
          eventId: "evt-1",
          sourceDeviceId: "device-b",
          createdAt: "2026-03-07T18:08:00Z",
        },
      ],
      lastError: null,
      initialize: initializeMock,
      join: joinMock,
      retryNow: retryNowMock,
      disable: disableMock,
      refresh: refreshMock,
      selectSharedFolder: selectSharedFolderMock,
    });
  });

  it("shows setup actions when sync is not configured", async () => {
    useFolderSyncMock.mockReturnValue({
      isLoading: false,
      state: {
        config: null,
        status: {
          syncState: "idle",
          lastCheckedAt: null,
          lastSuccessfulSyncAt: null,
          lastLocalExportAt: null,
          lastRemoteApplyAt: null,
          lastError: null,
          updatedAt: "2026-03-07T18:10:00Z",
        },
        history: [],
      },
      config: null,
      status: {
        syncState: "idle",
        lastCheckedAt: null,
        lastSuccessfulSyncAt: null,
        lastLocalExportAt: null,
        lastRemoteApplyAt: null,
        lastError: null,
        updatedAt: "2026-03-07T18:10:00Z",
      },
      history: [],
      lastError: null,
      initialize: initializeMock,
      join: joinMock,
      retryNow: retryNowMock,
      disable: disableMock,
      refresh: refreshMock,
      selectSharedFolder: selectSharedFolderMock,
    });

    const user = userEvent.setup();
    render(<FolderSyncCard />);

    await user.click(screen.getByRole("button", { name: "Initialize Sync" }));
    await user.click(screen.getByRole("button", { name: "Join Existing Sync" }));

    expect(initializeMock).toHaveBeenCalledTimes(1);
    expect(joinMock).toHaveBeenCalledTimes(1);
  });

  it("renders status summary, timestamps, and history", () => {
    render(<FolderSyncCard />);

    expect(screen.getByText("Folder Sync")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open folder sync guide" })).toHaveAttribute(
      "href",
      "https://panorama.gallantguo.com/docs/guides/sync",
    );
    expect(screen.getByText("Setup")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    expect(screen.getByText("Up to date")).toBeInTheDocument();
    expect(screen.getByText("/tmp/PanoramaSync")).toBeInTheDocument();
    expect(screen.getByText("Last successful sync")).toBeInTheDocument();
    expect(screen.getByText("2026-03-07T18:10:00Z")).toBeInTheDocument();
    expect(screen.getByText("Last remote change")).toBeInTheDocument();
    expect(screen.getAllByText("2026-03-07T18:08:00Z")).toHaveLength(2);
    expect(screen.getByText("Last local export")).toBeInTheDocument();
    expect(screen.getByText("2026-03-07T18:09:00Z")).toBeInTheDocument();
    expect(screen.getByText("Imported 1 remote event(s), skipped 0")).toBeInTheDocument();
  });

  it("invokes check now action", async () => {
    const user = userEvent.setup();
    render(<FolderSyncCard />);

    await user.click(screen.getByRole("button", { name: "Check now" }));

    expect(retryNowMock).toHaveBeenCalledTimes(1);
  });
});
