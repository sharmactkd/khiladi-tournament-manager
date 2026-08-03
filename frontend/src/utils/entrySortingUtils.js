const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

const clean = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const emptyLast = (left, right) => {
  const a = clean(left);
  const b = clean(right);
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return null;
};

const genderRank = (value) => {
  const normalized = clean(value).toLowerCase();
  if (["male", "m"].includes(normalized)) return 1;
  if (["female", "f"].includes(normalized)) return 2;
  return 99;
};

const ageRank = (value) => {
  const normalized = clean(value).toLowerCase().replace(/\s*-\s*/g, "-");
  const known = {
    "sub-junior": 10,
    subjunior: 10,
    cadet: 20,
    junior: 30,
    senior: 40,
    "not eligible": 9998,
  };
  if (known[normalized] !== undefined) return known[normalized];
  const under = normalized.match(/^under-?(\d+(?:\.\d+)?)$/);
  if (under) return 100 + Number(under[1]);
  const over = normalized.match(/^over-?(\d+(?:\.\d+)?)$/);
  if (over) return 500 + Number(over[1]);
  return 9000;
};

const weightParts = (value) => {
  const normalized = clean(value).toLowerCase();
  const number = Number(normalized.match(/\d+(?:\.\d+)?/)?.[0]);
  return {
    number: Number.isFinite(number) ? number : Number.POSITIVE_INFINITY,
    boundary: normalized.startsWith("under") ? 0 : normalized.startsWith("over") ? 1 : 2,
  };
};

const medalRank = (value) => {
  const normalized = clean(value).toLowerCase();
  return {
    gold: 1,
    silver: 2,
    bronze: 3,
    "x-x-x-x": 4,
  }[normalized] ?? 99;
};

export const compareEntryValues = (columnId, left, right) => {
  const emptyResult = emptyLast(left, right);
  if (emptyResult !== null) return emptyResult;

  if (columnId === "gender") {
    return genderRank(left) - genderRank(right) || collator.compare(clean(left), clean(right));
  }

  if (columnId === "ageCategory") {
    return ageRank(left) - ageRank(right) || collator.compare(clean(left), clean(right));
  }

  if (columnId === "weightCategory") {
    const a = weightParts(left);
    const b = weightParts(right);
    return a.number - b.number || a.boundary - b.boundary || collator.compare(clean(left), clean(right));
  }

  if (columnId === "medal") {
    return medalRank(left) - medalRank(right) || collator.compare(clean(left), clean(right));
  }

  return collator.compare(clean(left), clean(right));
};

export const createEntrySortingFn = (columnId) => (rowA, rowB) =>
  compareEntryValues(columnId, rowA.getValue(columnId), rowB.getValue(columnId));

export const subEventSortingFn = (rowA, rowB, columnId) => {
  const eventResult = compareEntryValues("event", rowA.getValue("event"), rowB.getValue("event"));
  if (eventResult !== 0) return eventResult;
  return compareEntryValues(columnId, rowA.getValue(columnId), rowB.getValue(columnId));
};

export const normalizeMultiSortingState = (sorting, allowedColumnIds, maxLevels = 4) => {
  const allowed = new Set(allowedColumnIds || []);
  const seen = new Set();
  const normalized = [];

  for (const rule of Array.isArray(sorting) ? sorting : []) {
    const id = String(rule?.id || "").trim();
    if (!id || !allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    normalized.push({ id, desc: rule?.desc === true });
    if (normalized.length >= maxLevels) break;
  }
  return normalized;
};

export const sortEntriesByRules = (entries, sorting) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry, originalIndex) => ({ entry, originalIndex }))
    .sort((left, right) => {
      for (const rule of Array.isArray(sorting) ? sorting : []) {
        const result = compareEntryValues(rule.id, left.entry?.[rule.id], right.entry?.[rule.id]);
        if (result !== 0) return rule.desc ? -result : result;
      }
      return left.originalIndex - right.originalIndex;
    })
    .map(({ entry }) => entry);
