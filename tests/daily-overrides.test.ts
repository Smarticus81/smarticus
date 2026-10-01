import assert from "node:assert/strict";
import { it } from "node:test";
import { deferredLessonIds, omitDeferredLessons, orderDailyLessons } from "../server/services/dailyOverrides.js";

it("revised October 1 omits deferred work without removing prior or later math records", async () => {
  assert.deepEqual(await deferredLessonIds("2026-10-01"), ["2026-10-01-mathematics", "2026-10-01-writing"]);
  const rows = [
    { date: new Date("2026-09-30"), externalId: "2026-09-30-mathematics" },
    { date: new Date("2026-10-01"), externalId: "2026-10-01-mathematics" },
    { date: new Date("2026-10-01"), externalId: "2026-10-01-writing" },
    { date: new Date("2026-10-01"), externalId: "2026-10-01-history_geography" },
    { date: new Date("2026-10-02"), externalId: "2026-10-02-mathematics" },
  ];
  assert.deepEqual((await omitDeferredLessons(rows)).map(row => row.externalId), ["2026-09-30-mathematics", "2026-10-01-history_geography", "2026-10-02-mathematics"]);
});

it("the revised day opens with French before science and the history video", async () => {
  const result = await orderDailyLessons("2026-10-01", [
    { externalId: "2026-10-01-history_geography" },
    { externalId: "2026-10-01-science" },
    { externalId: "2026-10-01-french" },
  ]);
  assert.deepEqual(result.map(row => row.externalId), ["2026-10-01-french", "2026-10-01-science", "2026-10-01-history_geography"]);
});
