import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecoveryDialog } from "./recovery-dialog";

const hookMocks = vi.hoisted(() => ({
  useDeviceSync: vi.fn(),
  handleRecovery: vi.fn(),
}));

vi.mock("../providers/device-sync-provider", () => ({
  useDeviceSync: hookMocks.useDeviceSync,
}));

describe("RecoveryDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookMocks.handleRecovery.mockResolvedValue(undefined);
    hookMocks.useDeviceSync.mockReturnValue({
      actions: {
        handleRecovery: hookMocks.handleRecovery,
      },
    });
  });

  it("shows the consumer recovery copy and runs recovery on confirm", async () => {
    render(<RecoveryDialog open />);

    expect(screen.getAllByText("Set Up This Device Again")).toHaveLength(2);
    expect(
      screen.getByText(
        "Sync was turned off for this device. Set it up again to keep your data up to date across your devices.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Set Up This Device Again" }));

    await waitFor(() => {
      expect(hookMocks.handleRecovery).toHaveBeenCalledTimes(1);
    });
  });
});
