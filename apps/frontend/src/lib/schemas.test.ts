import { describe, expect, it } from "vitest";

import { newAccountSchema } from "./schemas";

const validAccount = {
  name: "Family Brokerage",
  accountType: "SECURITIES",
  currency: "HKD",
  isActive: true,
};

describe("newAccountSchema", () => {
  it("keeps an optional account owner", () => {
    const result = newAccountSchema.safeParse({
      ...validAccount,
      accountOwner: "Alice",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accountOwner).toBe("Alice");
    }
  });

  it("stores a blank account owner as null", () => {
    const result = newAccountSchema.safeParse({
      ...validAccount,
      accountOwner: "   ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accountOwner).toBeNull();
    }
  });
});
