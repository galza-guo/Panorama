import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceSyncSection } from "./device-sync-section";

const hookMocks = vi.hoisted(() => ({
  useDevices: vi.fn(),
  useRenameDevice: vi.fn(),
  useRevokeDevice: vi.fn(),
  useDeviceSync: vi.fn(),
  getPairingSourceStatus: vi.fn(),
}));

vi.mock("../hooks", () => ({
  useDevices: hookMocks.useDevices,
  useRenameDevice: hookMocks.useRenameDevice,
  useRevokeDevice: hookMocks.useRevokeDevice,
}));

vi.mock("../providers/device-sync-provider", () => ({
  useDeviceSync: hookMocks.useDeviceSync,
}));

vi.mock("../services/sync-service", () => ({
  syncService: {
    getPairingSourceStatus: hookMocks.getPairingSourceStatus,
  },
}));

vi.mock("@/adapters", () => ({
  backupDatabase: vi.fn(),
  openFileSaveDialog: vi.fn(),
}));

vi.mock("./pairing-flow", () => ({
  PairingFlow: ({ title }: { title?: string }) => <div>{title ?? "Pairing Flow"}</div>,
  WaitingState: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("./recovery-dialog", () => ({
  RecoveryDialog: () => null,
}));

describe("DeviceSyncSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hookMocks.useRenameDevice.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    hookMocks.useRevokeDevice.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    hookMocks.useDevices.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
  });

  it("opens the claimer flow directly for an untrusted READY device", async () => {
    hookMocks.useDeviceSync.mockReturnValue({
      state: {
        isDetecting: false,
        syncState: "READY",
        trustedDevices: [{ id: "trusted-1", name: "Laptop", platform: "mac", lastSeenAt: null }],
        device: { trustState: "untrusted" },
        engineStatus: null,
        bootstrapStatus: "idle",
        bootstrapMessage: null,
        bootstrapOverwriteRisk: null,
        remoteSeedPresent: null,
      },
      actions: createActions(),
    });

    renderWithQueryClient(<DeviceSyncSection />);

    fireEvent.click(screen.getByRole("button", { name: "Connect This Device" }));

    expect(hookMocks.getPairingSourceStatus).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getAllByText("Connect This Device").length).toBeGreaterThan(1);
    });
  });

  it("requires confirmation when any other non-revoked device exists", async () => {
    hookMocks.useDeviceSync.mockReturnValue({
      state: {
        isDetecting: false,
        syncState: "READY",
        trustedDevices: [{ id: "trusted-1", name: "Laptop", platform: "mac", lastSeenAt: null }],
        device: { trustState: "trusted" },
        engineStatus: null,
        bootstrapStatus: "idle",
        bootstrapMessage: null,
        bootstrapOverwriteRisk: null,
        remoteSeedPresent: null,
      },
      actions: createActions(),
    });
    hookMocks.useDevices.mockReturnValue({
      data: [
        { id: "current", displayName: "This device", trustState: "trusted", isCurrent: true },
        { id: "other", displayName: "Other device", trustState: "untrusted", isCurrent: false },
      ],
      isLoading: false,
      error: null,
    });
    hookMocks.getPairingSourceStatus.mockResolvedValue({
      status: "restore_required",
      message: "Restore required",
      localCursor: 11,
      serverCursor: 8,
    });

    renderWithQueryClient(<DeviceSyncSection />);

    fireEvent.click(screen.getByRole("button", { name: "Connect Another Device" }));

    await waitFor(() => {
      expect(hookMocks.getPairingSourceStatus).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
  });

  it("opens the issuer flow after the current device is confirmed ready", async () => {
    hookMocks.useDeviceSync.mockReturnValue({
      state: {
        isDetecting: false,
        syncState: "READY",
        trustedDevices: [{ id: "trusted-1", name: "Laptop", platform: "mac", lastSeenAt: null }],
        device: { trustState: "trusted" },
        engineStatus: null,
        bootstrapStatus: "idle",
        bootstrapMessage: null,
        bootstrapOverwriteRisk: null,
        remoteSeedPresent: null,
      },
      actions: createActions(),
    });
    hookMocks.getPairingSourceStatus.mockResolvedValue({
      status: "ready",
      message: "Ready",
      localCursor: 8,
      serverCursor: 8,
    });

    renderWithQueryClient(<DeviceSyncSection />);

    fireEvent.click(screen.getByRole("button", { name: "Connect Another Device" }));

    await waitFor(() => {
      expect(hookMocks.getPairingSourceStatus).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getAllByText("Connect Another Device").length).toBeGreaterThan(1);
    });
  });

  it("reinitializes sync immediately when restore is required and no other devices remain", async () => {
    const actions = createActions();
    hookMocks.useDeviceSync.mockReturnValue({
      state: {
        isDetecting: false,
        syncState: "READY",
        trustedDevices: [{ id: "trusted-1", name: "Laptop", platform: "mac", lastSeenAt: null }],
        device: { trustState: "trusted" },
        engineStatus: null,
        bootstrapStatus: "idle",
        bootstrapMessage: null,
        bootstrapOverwriteRisk: null,
        remoteSeedPresent: null,
      },
      actions,
    });
    hookMocks.getPairingSourceStatus.mockResolvedValue({
      status: "restore_required",
      message: "Restore required",
      localCursor: 11,
      serverCursor: 8,
    });

    renderWithQueryClient(<DeviceSyncSection />);

    fireEvent.click(screen.getByRole("button", { name: "Connect Another Device" }));

    await waitFor(() => {
      expect(hookMocks.getPairingSourceStatus).toHaveBeenCalledTimes(1);
      expect(actions.reinitializeSync).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });

  it("shows the upstream waiting-for-snapshot message while a trusted device uploads bootstrap data", () => {
    hookMocks.useDeviceSync.mockReturnValue({
      state: {
        isDetecting: false,
        syncState: "READY",
        trustedDevices: [{ id: "trusted-1", name: "Laptop", platform: "mac", lastSeenAt: null }],
        device: { trustState: "untrusted" },
        engineStatus: null,
        bootstrapStatus: "success",
        bootstrapMessage: "Waiting for a trusted device to upload a snapshot",
        bootstrapAction: "NO_REMOTE_PULL",
        bootstrapOverwriteRisk: null,
        remoteSeedPresent: null,
      },
      actions: createActions(),
    });

    renderWithQueryClient(<DeviceSyncSection />);

    expect(
      screen.getByText("Waiting for a trusted device to upload a snapshot"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No data replacement is needed. This device can keep its current data."),
    ).not.toBeInTheDocument();
  });
});

function createActions() {
  return {
    refreshState: vi.fn(),
    continueBootstrapWithOverwrite: vi.fn().mockResolvedValue(undefined),
    reinitializeSync: vi.fn().mockResolvedValue(undefined),
    stopBackgroundSync: vi.fn().mockResolvedValue(undefined),
    startBackgroundSync: vi.fn().mockResolvedValue(undefined),
    resetSync: vi.fn().mockResolvedValue(undefined),
  };
}

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
