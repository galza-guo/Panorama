import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getFolderSyncStateMock,
  initializeFolderSyncMock,
  joinFolderSyncMock,
  retryFolderSyncNowMock,
  disableFolderSyncMock,
  openFolderDialogMock,
  useAuthMock,
} = vi.hoisted(() => ({
  getFolderSyncStateMock: vi.fn(),
  initializeFolderSyncMock: vi.fn(),
  joinFolderSyncMock: vi.fn(),
  retryFolderSyncNowMock: vi.fn(),
  disableFolderSyncMock: vi.fn(),
  openFolderDialogMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("@/adapters", () => ({
  getFolderSyncState: getFolderSyncStateMock,
  initializeFolderSync: initializeFolderSyncMock,
  joinFolderSync: joinFolderSyncMock,
  retryFolderSyncNow: retryFolderSyncNowMock,
  disableFolderSync: disableFolderSyncMock,
  openFolderDialog: openFolderDialogMock,
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: useAuthMock,
}));

import { useFolderSync } from "./use-folder-sync";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  Wrapper.displayName = "FolderSyncTestWrapper";
  return Wrapper;
}

describe("useFolderSync", () => {
  beforeEach(() => {
    getFolderSyncStateMock.mockResolvedValue({
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
    });
    initializeFolderSyncMock.mockResolvedValue({ status: "initialized" });
    joinFolderSyncMock.mockResolvedValue({ status: "joined" });
    retryFolderSyncNowMock.mockResolvedValue({ status: "ok" });
    disableFolderSyncMock.mockResolvedValue({ status: "disabled" });
    openFolderDialogMock.mockResolvedValue("/tmp/PanoramaSync");
    useAuthMock.mockReturnValue({ isAuthenticated: true, statusLoading: false });
  });

  it("loads current folder sync state", async () => {
    const { result } = renderHook(() => useFolderSync(), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.state?.status.syncState).toBe("up_to_date");
  });

  it("exposes sync history entries", async () => {
    const { result } = renderHook(() => useFolderSync(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.history).toHaveLength(1));
    expect(result.current.history[0]?.message).toContain("Imported 1 remote event");
  });

  it("invokes retryNow action", async () => {
    const { result } = renderHook(() => useFolderSync(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await result.current.retryNow();

    expect(retryFolderSyncNowMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces attention states from backend status", async () => {
    getFolderSyncStateMock.mockResolvedValueOnce({
      config: null,
      status: {
        syncState: "folder_unavailable",
        lastCheckedAt: null,
        lastSuccessfulSyncAt: null,
        lastLocalExportAt: null,
        lastRemoteApplyAt: null,
        lastError: "Shared folder is unavailable",
        updatedAt: "2026-03-07T18:10:00Z",
      },
      history: [],
    });

    const { result } = renderHook(() => useFolderSync(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.state?.status.syncState).toBe("folder_unavailable");
    expect(result.current.lastError).toBe("Shared folder is unavailable");
  });
});
