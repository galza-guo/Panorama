import { afterEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("./platform", () => ({
  invoke: invokeMock,
}));

import { updateAlternativeAssetMetadata } from "./alternative-assets";

describe("alternative-assets adapter", () => {
  afterEach(() => {
    invokeMock.mockReset();
  });

  it("passes structured metadata updates through unchanged", async () => {
    invokeMock.mockResolvedValue(undefined);

    const metadata = {
      owner: "Alice",
      mpf_subfunds: [
        {
          name: "Core Accumulation",
          allocation_pct: 60.5,
        },
      ],
      fund_allocation: {
        "Core Accumulation": 60.5,
      },
      obsolete: null,
    };

    await updateAlternativeAssetMetadata("ALT-123", metadata, "MPF Account", "Quarterly refresh");

    expect(invokeMock).toHaveBeenCalledWith("update_alternative_asset_metadata", {
      assetId: "ALT-123",
      name: "MPF Account",
      metadata,
      notes: "Quarterly refresh",
    });
  });
});
