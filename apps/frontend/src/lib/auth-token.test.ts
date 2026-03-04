import { afterEach, describe, expect, it, vi } from "vitest";

describe("auth-token", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("falls back to in-memory auth state when localStorage methods are unavailable", async () => {
    const brokenLocalStorage = {};

    vi.stubGlobal("localStorage", brokenLocalStorage);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: brokenLocalStorage,
    });

    const authToken = await import("./auth-token");

    expect(authToken.getAuthToken()).toBeNull();
    expect(() => authToken.setAuthToken("test-token")).not.toThrow();
    expect(authToken.getAuthToken()).toBe("test-token");
    expect(() => authToken.setAuthToken(null)).not.toThrow();
    expect(authToken.getAuthToken()).toBeNull();
  });
});
