import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateMasteryStatus } from "../server/services/mastery.js";

describe("calculateMasteryStatus", () => {
  const thresholds = { high: 90, low: 75 };

  it("keeps missing evidence unassessed", () => {
    assert.equal(calculateMasteryStatus(null, thresholds), "not_assessed");
  });

  it("maps boundary scores to the configured levels", () => {
    assert.equal(calculateMasteryStatus(74.9, thresholds), "needs_reteach");
    assert.equal(calculateMasteryStatus(75, thresholds), "proficient");
    assert.equal(calculateMasteryStatus(90, thresholds), "mastered");
  });
});
