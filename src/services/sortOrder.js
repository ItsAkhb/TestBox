// Pure sorting + manual-order helpers shared by the Folders grid/list and
// the Folder page's exam list. Everything here is side-effect free so the
// full sort matrix (§18) can be unit-tested directly, and so view code can
// recompute ordering on every render without touching persistence.

export const SORT_MODES = [
  "name-asc",
  "name-desc",
  "created-asc",
  "created-desc",
  "updated-asc",
  "updated-desc",
  "custom",
];

// "custom" keeps the raw stored array order — identical to the app's
// pre-sorting behavior — so it is both the default and the Custom/Manual
// mode (promt §1: current ordering remains the default).
export const DEFAULT_SORT_MODE = "custom";

const collators = new Map();

// Locale-aware, Unicode/numeric-aware comparison. Persian, Arabic and
// mixed Persian+English names collate naturally; "2" < "10" via numeric.
function getCollator(locale) {
  const key = locale === "en" ? "en" : "fa";
  if (!collators.has(key)) {
    collators.set(
      key,
      new Intl.Collator(key, { numeric: true, sensitivity: "base" })
    );
  }
  return collators.get(key);
}

export function compareNames(a, b, locale) {
  return getCollator(locale).compare(String(a ?? ""), String(b ?? ""));
}

// Created/Updated modes compare actual stored ISO timestamps — never
// formatted display strings (promt §5). Updated falls back to createdAt
// for records edited before updatedAt stamping existed.
function timeOf(item, kind) {
  if (kind === "created") {
    const t = Date.parse(item?.createdAt ?? "");
    return Number.isNaN(t) ? 0 : t;
  }
  const updated = Date.parse(item?.updatedAt ?? "");
  if (!Number.isNaN(updated)) return updated;
  const created = Date.parse(item?.createdAt ?? "");
  return Number.isNaN(created) ? 0 : created;
}

// Projects the stored custom order onto the current item list. Items
// missing from storedOrder (created after the last reorder) keep their
// storage order and append after the ordered ones; stale ids are dropped.
export function applyCustomOrder(items, storedOrder = []) {
  const rank = new Map();
  storedOrder.forEach((id) => {
    const key = String(id);
    if (!rank.has(key)) rank.set(key, rank.size);
  });
  let nextRank = rank.size;
  return items
    .map((item, index) => {
      const key = String(item?.id ?? "");
      const itemRank = rank.has(key) ? rank.get(key) : nextRank++;
      return { item, index, itemRank };
    })
    .sort((a, b) => a.itemRank - b.itemRank || a.index - b.index)
    .map((entry) => entry.item);
}

// Canonical id sequence for every current item: storedOrder first (alive
// ids only), then unseen items in storage order. Reorders persist against
// this full list so filtering (subject chips) can never drop items.
export function buildCustomOrder(items, storedOrder = []) {
  const alive = new Set();
  items.forEach((item) => {
    const key = String(item?.id ?? "");
    if (key) alive.add(key);
  });
  const seen = new Set();
  const result = [];
  storedOrder.forEach((id) => {
    const key = String(id);
    if (alive.has(key) && !seen.has(key)) {
      result.push(key);
      seen.add(key);
    }
  });
  items.forEach((item) => {
    const key = String(item?.id ?? "");
    if (key && !seen.has(key)) {
      result.push(key);
      seen.add(key);
    }
  });
  return result;
}

// Splices a reordered visible sequence back into the canonical (all
// items) order: positions held by visible items receive the new sequence
// in order; hidden items keep their slots. Handles filtered views.
export function mergeVisibleOrder(canonicalOrder, visibleIds, reorderedVisibleIds) {
  const visible = new Set(visibleIds.map(String));
  const queue = reorderedVisibleIds.map(String);
  let cursor = 0;
  return canonicalOrder.map((id) => {
    if (!visible.has(String(id))) return id;
    if (cursor >= queue.length) return id;
    return queue[cursor++];
  });
}

// Pure move for the accessible up/down buttons (custom mode).
export function moveItem(list, fromIndex, toIndex) {
  if (
    !Array.isArray(list) ||
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= list.length ||
    toIndex >= list.length
  ) {
    return Array.isArray(list) ? [...list] : [];
  }
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

// Single entry point for all list ordering. Always returns a new array.
export function sortItems(items, mode = DEFAULT_SORT_MODE, storedOrder = [], locale = "fa") {
  const list = Array.isArray(items) ? [...items] : [];
  switch (mode) {
    case "name-asc":
      return list.sort((a, b) => compareNames(a?.name, b?.name, locale));
    case "name-desc":
      return list.sort((a, b) => compareNames(b?.name, a?.name, locale));
    case "created-asc":
      return list.sort((a, b) => timeOf(a, "created") - timeOf(b, "created"));
    case "created-desc":
      return list.sort((a, b) => timeOf(b, "created") - timeOf(a, "created"));
    case "updated-asc":
      return list.sort((a, b) => timeOf(a, "updated") - timeOf(b, "updated"));
    case "updated-desc":
      return list.sort((a, b) => timeOf(b, "updated") - timeOf(a, "updated"));
    case "custom":
    default:
      return applyCustomOrder(list, storedOrder);
  }
}

export function sortFolders(folders, mode, storedOrder, locale) {
  return sortItems(folders, mode, storedOrder, locale);
}

export function sortExams(exams, mode, storedOrder, locale) {
  return sortItems(exams, mode, storedOrder, locale);
}
