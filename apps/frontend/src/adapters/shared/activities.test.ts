import { afterEach, describe, expect, it, vi } from "vitest";

const { invokeMock, loggerErrorMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("./platform", () => ({
  invoke: invokeMock,
  logger: {
    error: loggerErrorMock,
  },
}));

import { createActivity, saveActivities, updateActivity } from "./activities";

describe("activities adapter", () => {
  afterEach(() => {
    invokeMock.mockReset();
    loggerErrorMock.mockReset();
  });

  it("serializes metadata objects when creating an activity", async () => {
    invokeMock.mockResolvedValue({ id: "act-1" });

    await createActivity({
      accountId: "acc-hkd",
      activityType: "INTEREST",
      activityDate: "2026-02-20",
      amount: "200",
      currency: "HKD",
      metadata: { source: "time-deposit" },
    });

    expect(invokeMock).toHaveBeenCalledWith("create_activity", {
      activity: expect.objectContaining({
        metadata: JSON.stringify({ source: "time-deposit" }),
      }),
    });
  });

  it("serializes metadata objects in bulk activity mutations", async () => {
    invokeMock.mockResolvedValue({
      created: [],
      updated: [],
      deleted: [],
      createdMappings: [],
      errors: [],
    });

    await saveActivities({
      creates: [
        {
          accountId: "acc-hkd",
          activityType: "SELL",
          activityDate: "2026-02-20",
          symbol: { id: "ALT-TD-1" },
          quantity: "1",
          unitPrice: "10000",
          currency: "HKD",
          metadata: { role: "settlement_principal" },
        },
      ],
      updates: [
        {
          id: "act-2",
          accountId: "acc-hkd",
          activityType: "INTEREST",
          activityDate: "2026-02-20",
          amount: "200",
          currency: "HKD",
          metadata: { role: "settlement_interest" },
        },
      ],
    });

    expect(invokeMock).toHaveBeenCalledWith("save_activities", {
      request: {
        creates: [
          expect.objectContaining({
            metadata: JSON.stringify({ role: "settlement_principal" }),
          }),
        ],
        updates: [
          expect.objectContaining({
            metadata: JSON.stringify({ role: "settlement_interest" }),
          }),
        ],
        deleteIds: [],
      },
    });
  });

  it("keeps existing metadata strings unchanged", async () => {
    invokeMock.mockResolvedValue({ id: "act-1" });

    await updateActivity({
      id: "act-1",
      accountId: "acc-hkd",
      activityType: "INTEREST",
      activityDate: "2026-02-20",
      amount: "200",
      currency: "HKD",
      metadata: "{\"already\":\"serialized\"}",
    });

    expect(invokeMock).toHaveBeenCalledWith("update_activity", {
      activity: expect.objectContaining({
        metadata: "{\"already\":\"serialized\"}",
      }),
    });
  });
});
