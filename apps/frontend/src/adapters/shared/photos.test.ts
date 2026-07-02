import { afterEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("./platform", () => ({
  invoke: invokeMock,
}));

import { deleteFilmRoll, movePhotos } from "./photos";

describe("photos adapter", () => {
  afterEach(() => {
    invokeMock.mockReset();
  });

  it("moves photos to a film roll", async () => {
    invokeMock.mockResolvedValue(undefined);

    await movePhotos(["photo-1"], "roll-1");

    expect(invokeMock).toHaveBeenCalledWith("move_photos", {
      photoIds: ["photo-1"],
      destinationFilmRollId: "roll-1",
    });
  });

  it("moves photos back to tray", async () => {
    invokeMock.mockResolvedValue(undefined);

    await movePhotos(["photo-1"], null);

    expect(invokeMock).toHaveBeenCalledWith("move_photos", {
      photoIds: ["photo-1"],
      destinationFilmRollId: null,
    });
  });

  it("defaults film roll deletion to safe mode", async () => {
    invokeMock.mockResolvedValue(undefined);

    await deleteFilmRoll("roll-1");

    expect(invokeMock).toHaveBeenCalledWith("delete_film_roll", {
      filmRollId: "roll-1",
      mode: "MovePhotosToTray",
    });
  });
});
