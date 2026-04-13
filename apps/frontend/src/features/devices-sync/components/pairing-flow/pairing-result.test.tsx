import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PairingResult } from "./pairing-result";

describe("PairingResult", () => {
  it("formats restore-required sync errors into user-facing guidance", () => {
    render(
      <PairingResult
        success={false}
        error="SYNC_SOURCE_RESTORE_REQUIRED: Local sync state is ahead of the last confirmed sync state on the server."
      />,
    );

    expect(screen.getByText("Connection failed")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Sync needs to be restored from this device before you can connect another device.",
      ),
    ).toBeInTheDocument();
  });
});
