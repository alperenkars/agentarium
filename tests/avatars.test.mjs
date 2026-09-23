import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assignMissingAvatars,
  randomAvatar,
  avatarOptions,
} from "../src/avatars.mjs";

test("random assignment can choose every available character", () => {
  assert.equal(avatarOptions.length, 7);
  assert.equal(new Set(avatarOptions.map((a) => a.id)).size, 7);
  avatarOptions.forEach((avatar, index) => {
    assert.equal(
      randomAvatar(() => (index + 0.5) / avatarOptions.length),
      avatar.id,
    );
  });
});
test("migration preserves existing choices, history and original objects", () => {
  const old = {
    id: "old",
    shape: 5,
    tags: ["Retail"],
    milestones: [{ title: "A milestone" }],
  };
  const chosen = { ...old, id: "chosen", avatarId: "huberthart-hood" };
  const result = assignMissingAvatars([old, chosen], () => 0);
  assert.equal(result[0].avatarId, "huberthart-monk");
  assert.equal(result[0].milestones, old.milestones);
  assert.equal(result[0].shape, 5);
  assert.equal(result[1], chosen);
  assert.equal(old.avatarId, undefined);
  assert.deepEqual(
    assignMissingAvatars(result, () => {
      throw Error("Must not reroll");
    }),
    result,
  );
});
test("unknown or invalid avatars are repaired", () => {
  for (const avatarId of [null, "missing", 5]) {
    assert.equal(
      assignMissingAvatars([{ avatarId }], () => 0.99)[0].avatarId,
      "styloo-student",
    );
  }
});
