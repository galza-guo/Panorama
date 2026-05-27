import { afterEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("./platform", () => ({
  invoke: invokeMock,
  isWeb: false,
}));

import {
  createWebullHkConnection,
  linkWebullHkAccount,
  syncWebullHkAccountSnapshot,
} from "./webull-hk";

describe("webull-hk adapter", () => {
  afterEach(() => {
    invokeMock.mockReset();
  });

  it("creates a connection with the Tauri request payload", async () => {
    const request = {
      displayName: "Family Webull HK",
      environment: "SANDBOX" as const,
      ownerName: "Alice",
      appKey: "app-key",
      appSecret: "app-secret",
      accessToken: "access-token",
    };
    invokeMock.mockResolvedValue({ id: "connection-1" });

    await createWebullHkConnection(request);

    expect(invokeMock).toHaveBeenCalledWith("create_webull_hk_connection", { request });
  });

  it("links a remote account to an existing Panorama account prospectively", async () => {
    const request = {
      connectionId: "connection-1",
      remoteAccountId: "webull-account-1",
      localAccountId: "local-account-1",
      remoteAccountNumberMasked: "1234",
      remoteAccountType: "MARGIN",
      sourceFromDate: "2026-05-27",
    };
    invokeMock.mockResolvedValue({ id: "link-1" });

    await linkWebullHkAccount(request);

    expect(invokeMock).toHaveBeenCalledWith("link_webull_hk_account", { request });
  });

  it("syncs a linked account snapshot through the existing snapshot path", async () => {
    invokeMock.mockResolvedValue({ linkId: "link-1", positions: 2 });

    await syncWebullHkAccountSnapshot("link-1");

    expect(invokeMock).toHaveBeenCalledWith("sync_webull_hk_account_snapshot", {
      linkId: "link-1",
    });
  });
});
