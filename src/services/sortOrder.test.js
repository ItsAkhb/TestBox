import test from "node:test";
import assert from "node:assert/strict";

import {
  sortItems,
  sortFolders,
  sortExams,
  applyCustomOrder,
  buildCustomOrder,
  mergeVisibleOrder,
  moveItem,
  compareNames,
  SORT_MODES,
  DEFAULT_SORT_MODE,
} from "./sortOrder.js";

const iso = (day, hour = 0) =>
  `2026-0${day}T${String(hour).padStart(2, "0")}:00:00.000Z`;

function folder(id, name, createdAt, updatedAt) {
  return { id, name, createdAt, ...(updatedAt ? { updatedAt } : {}) };
}

function exam(id, name, createdAt, updatedAt) {
  return { id, name, createdAt, ...(updatedAt ? { updatedAt } : {}) };
}

test("sorting: default mode is custom and preserves storage order", () => {
  assert.equal(DEFAULT_SORT_MODE, "custom");
  assert.ok(SORT_MODES.includes("custom"));

  const items = [folder(3, "C", iso(1)), folder(1, "A", iso(2)), folder(2, "B", iso(3))];
  const byDefault = sortItems(items);
  assert.deepEqual(byDefault.map((f) => f.id), [3, 1, 2], "no mode → storage order");

  const byUnknown = sortItems(items, "no-such-mode");
  assert.deepEqual(byUnknown.map((f) => f.id), [3, 1, 2], "unknown mode → storage order");
});

test("sorting: folder name ascending / descending (latin, case-insensitive)", () => {
  const items = [folder(1, "Physics", iso(1)), folder(2, "apple", iso(2)), folder(3, "Math", iso(3))];

  const asc = sortFolders(items, "name-asc", [], "en");
  assert.deepEqual(asc.map((f) => f.name), ["apple", "Math", "Physics"]);

  const desc = sortFolders(items, "name-desc", [], "en");
  assert.deepEqual(desc.map((f) => f.name), ["Physics", "Math", "apple"]);
});

test("sorting: Persian names sort alphabetically, not by ASCII/code unit", () => {
  const items = [
    folder(1, "موز", iso(1)),
    folder(2, "سیب", iso(2)),
    folder(3, "الف", iso(3)),
    folder(4, "ب", iso(4)),
  ];

  const asc = sortFolders(items, "name-asc", [], "fa");
  assert.deepEqual(asc.map((f) => f.name), ["الف", "ب", "سیب", "موز"]);

  assert.ok(compareNames("الف", "ب", "fa") < 0, "alef before beh");
  assert.ok(compareNames("سیب", "موز", "fa") < 0, "sin before mim");
});

test("sorting: Persian + Latin digits compare numerically (۲ before ۱۰, 2 before 10)", () => {
  const faDigits = sortFolders(
    [folder(1, "آزمون ۱۰", iso(1)), folder(2, "آزمون ۲", iso(2))],
    "name-asc",
    [],
    "fa"
  );
  assert.deepEqual(faDigits.map((f) => f.name), ["آزمون ۲", "آزمون ۱۰"]);

  const latDigits = sortFolders(
    [folder(1, "test 10", iso(1)), folder(2, "test 2", iso(2))],
    "name-asc",
    [],
    "en"
  );
  assert.deepEqual(latDigits.map((f) => f.name), ["test 2", "test 10"]);
});

test("sorting: mixed Persian + English names sort naturally", () => {
  const items = [
    folder(1, "Physics", iso(1)),
    folder(2, "ریاضی", iso(2)),
    folder(3, "Math", iso(3)),
  ];
  const sorted = sortFolders(items, "name-asc", [], "fa");
  assert.deepEqual(sorted.map((f) => f.name), ["ریاضی", "Math", "Physics"]);

  const desc = sortFolders(items, "name-desc", [], "fa");
  assert.deepEqual(desc.map((f) => f.name), ["Physics", "Math", "ریاضی"]);
});

test("sorting: created newest first / oldest first uses stored timestamps", () => {
  const items = [
    folder(1, "old", iso(1)),
    folder(2, "new", iso(5)),
    folder(3, "mid", iso(3)),
  ];

  const newest = sortFolders(items, "created-desc", []);
  assert.deepEqual(newest.map((f) => f.id), [2, 3, 1]);

  const oldest = sortFolders(items, "created-asc", []);
  assert.deepEqual(oldest.map((f) => f.id), [1, 3, 2]);
});

test("sorting: updated uses updatedAt and falls back to createdAt", () => {
  const items = [
    folder(1, "edited-recently", iso(1), iso(6)),
    folder(2, "edited-long-ago", iso(5), iso(2)),
    folder(3, "never-edited", iso(3)),
  ];

  const recent = sortFolders(items, "updated-desc", []);
  assert.deepEqual(recent.map((f) => f.id), [1, 3, 2], "newest edit first, fallback to createdAt");

  const least = sortFolders(items, "updated-asc", []);
  assert.deepEqual(least.map((f) => f.id), [2, 3, 1], "f2 (day 2) < f3 (created day 3) < f1 (day 6)");
});

test("sorting: exam list supports the same modes (engine is shared)", () => {
  const exams = [
    exam(10, "زیست", iso(1), iso(4)),
    exam(11, "Chemistry", iso(6)),
    exam(12, "Algebra", iso(3), iso(2)),
  ];

  assert.deepEqual(
    sortExams(exams, "name-asc", [], "en").map((e) => e.name),
    ["Algebra", "Chemistry", "زیست"]
  );
  assert.deepEqual(
    sortExams(exams, "created-desc", []).map((e) => e.id),
    [11, 12, 10]
  );
  assert.deepEqual(
    sortExams(exams, "updated-desc", []).map((e) => e.id),
    [11, 10, 12],
    "11 (never edited → created day 6), 10 (edited day 4), 12 (edited day 2)"
  );

  const orderA = [12, 10, 11];
  const orderB = [11, 12, 10];
  assert.deepEqual(sortExams(exams, "custom", orderA).map((e) => e.id), [12, 10, 11]);
  assert.deepEqual(sortExams(exams, "custom", orderB).map((e) => e.id), [11, 12, 10]);
  assert.deepEqual(
    sortExams(exams, "custom", orderA).map((e) => e.id),
    [12, 10, 11],
    "one folder's order never affects another (order array is a pure input)"
  );
});

test("custom order: applyCustomOrder honors stored ids and appends new items", () => {
  const items = [folder(1, "A", iso(1)), folder(2, "B", iso(2)), folder(3, "C", iso(3))];

  const reordered = applyCustomOrder(items, [3, 1]);
  assert.deepEqual(reordered.map((f) => f.id), [3, 1, 2], "stored first, unseen append in storage order");

  const withStale = applyCustomOrder(items, [99, 2, 1, 2]);
  assert.deepEqual(withStale.map((f) => f.id), [2, 1, 3], "stale ids dropped, duplicates ignored");
});

test("custom order: buildCustomOrder keeps every alive item exactly once", () => {
  const items = [folder(1, "A", iso(1)), folder(2, "B", iso(2)), folder(3, "C", iso(3))];

  const canonical = buildCustomOrder(items, [2, 99]);
  assert.deepEqual(canonical, ["2", "1", "3"], "stored first (stale dropped), then the rest in storage order");

  assert.deepEqual(buildCustomOrder(items, []), ["1", "2", "3"]);
  assert.deepEqual(buildCustomOrder([], [1, 2]), [], "no items → no ids");
});

test("custom order: mergeVisibleOrder splices reordered visible items, hidden keep slots", () => {
  const canonical = ["1", "2", "3", "4", "5"];
  const visible = ["2", "4"];
  const reordered = ["4", "2"];

  assert.deepEqual(
    mergeVisibleOrder(canonical, visible, reordered),
    ["1", "4", "3", "2", "5"],
    "hidden ids 3 and 5 keep their positions"
  );

  assert.deepEqual(
    mergeVisibleOrder(canonical, visible, visible),
    canonical,
    "no-op reorder is stable"
  );
});

test("custom order: moveItem moves an item and guards boundaries", () => {
  const list = ["a", "b", "c"];
  assert.deepEqual(moveItem(list, 0, 1), ["b", "a", "c"]);
  assert.deepEqual(moveItem(list, 2, 0), ["c", "a", "b"]);
  assert.deepEqual(moveItem(list, 1, 1), ["a", "b", "c"], "same index → equivalent copy");
  assert.deepEqual(moveItem(list, -1, 1), ["a", "b", "c"], "out of range → unchanged copy");
  assert.deepEqual(moveItem(list, 0, 9), ["a", "b", "c"], "out of range → unchanged copy");
  assert.deepEqual(list, ["a", "b", "c"], "input never mutated");
});

test("sorting never mutates the input array", () => {
  const items = [folder(1, "B", iso(2)), folder(2, "A", iso(1))];
  const snapshot = items.map((f) => f.id);
  sortFolders(items, "name-asc", [], "en");
  sortFolders(items, "created-desc", []);
  sortFolders(items, "custom", [2, 1]);
  assert.deepEqual(items.map((f) => f.id), snapshot);
});
