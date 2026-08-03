export const ENTRY_SYNC_BATCH_SIZE = 75;
export const AUTO_CATEGORY_MEDAL_SOURCE = "category-auto";
export const MEDAL_CATEGORY_FIELDS = Object.freeze([
  "gender",
  "ageCategory",
  "weightCategory",
  "event",
  "subEvent",
]);

export const createStableId = (prefix = "id") => {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
};

export const createTemporaryEntryId = () => createStableId("entry");

export const getEntrySyncScope = (tournamentId, userId) =>
  `${String(userId || "anonymous")}:${String(tournamentId || "unknown")}`;

export const ENTRY_SYNC_UPDATE_FIELDS = new Set([
  "title",
  "name",
  "fathersName",
  "school",
  "schoolName",
  "class",
  "team",
  "gender",
  "dob",
  "weight",
  "event",
  "subEvent",
  "ageCategory",
  "weightCategory",
  "medal",
  "medalSource",
  "medalUpdatedAt",
  "entrySource",
  "sourceSubmissionId",
  "sourcePlayerId",
  "sr",
  "srNo",
  "coach",
  "coachContact",
  "manager",
  "managerContact",
]);

export const sanitizeEntryUpdates = (updates = {}) => {
  const result = {};
  for (const [key, value] of Object.entries(updates || {})) {
    if (!ENTRY_SYNC_UPDATE_FIELDS.has(key)) continue;
    result[key] = value;
  }
  return result;
};

export const mergeEntryUpdates = (current = {}, incoming = {}) => ({
  ...sanitizeEntryUpdates(current),
  ...sanitizeEntryUpdates(incoming),
});

export const chunkEntryOperations = (
  operations = [],
  size = ENTRY_SYNC_BATCH_SIZE
) => {
  const chunks = [];
  for (let index = 0; index < operations.length; index += size) {
    chunks.push(operations.slice(index, index + size));
  }
  return chunks;
};

export const reconcileEntriesWithPending = (
  serverEntries = [],
  pendingOperations = []
) => {
  const entries = new Map(
    (Array.isArray(serverEntries) ? serverEntries : []).map((entry) => [
      String(entry.entryId),
      { ...entry },
    ])
  );

  const sortedOperations = [...(pendingOperations || [])].sort(
    (left, right) => Number(left.clientSeq || 0) - Number(right.clientSeq || 0)
  );

  for (const operation of sortedOperations) {
    const entryId = String(operation.entryId || "");
    if (!entryId) continue;
    if (operation.type === "delete") {
      entries.delete(entryId);
      continue;
    }
    entries.set(entryId, {
      ...(entries.get(entryId) || { entryId }),
      ...(operation.updates || {}),
      entryId,
      pendingSync: true,
    });
  }

  return [...entries.values()].sort(
    (left, right) =>
      Number(left.srNo || left.sr || Number.MAX_SAFE_INTEGER) -
      Number(right.srNo || right.sr || Number.MAX_SAFE_INTEGER)
  );
};

export const isRetryableEntrySyncError = (error) =>
  error?.retryable === true ||
  !error?.status ||
  error.status === 409 ||
  error.status === 429 ||
  error.status >= 500;

export const getRetryDelayMs = (attempt, retryAfterMs = 0) => {
  if (retryAfterMs > 0) return retryAfterMs;
  const exponential = Math.min(30000, 1000 * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 500);
  return exponential + jitter;
};

export const buildBracketEntrySignature = (entries = []) => {
  const normalized = (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      entryId: String(entry?.entryId || "").trim(),
      name: String(entry?.name || "").trim(),
      team: String(entry?.team || "").trim(),
      gender: String(entry?.gender || "").trim(),
      ageCategory: String(entry?.ageCategory || "").trim(),
      weightCategory: String(entry?.weightCategory || "").trim(),
      event: String(entry?.event || "").trim(),
      subEvent: String(entry?.subEvent || "").trim(),
    }))
    .sort((left, right) => left.entryId.localeCompare(right.entryId));

  const input = JSON.stringify(normalized);
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
};

export const buildBracketCategoryKey = (entry = {}) =>
  MEDAL_CATEGORY_FIELDS.map((field) => entry?.[field])
    .map((value) =>
      String(value || "")
        .normalize("NFKC")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
    )
    .join("|");

export const buildMedalCategoryKey = buildBracketCategoryKey;

export const hasCompleteMedalCategory = (entry = {}) =>
  MEDAL_CATEGORY_FIELDS.every((field) => String(entry?.[field] || "").trim());

export const countCategoryMedals = (entries = [], categoryKey = "") => {
  const counts = { Gold: 0, Silver: 0, Bronze: 0 };

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!hasCompleteMedalCategory(entry)) continue;
    if (buildMedalCategoryKey(entry) !== categoryKey) continue;
    if (String(entry?.medalSource || "") === "tiesheet") continue;
    const medal = String(entry?.medal || "").trim();
    if (Object.hasOwn(counts, medal)) counts[medal] += 1;
  }

  return counts;
};

export const isCategoryPodiumComplete = (counts = {}) =>
  Number(counts.Gold || 0) === 1 &&
  Number(counts.Silver || 0) === 1 &&
  Number(counts.Bronze || 0) === 2;

export const reconcileCompletedCategoryMedals = (
  entries = [],
  categoryKeys = [],
  { now = new Date().toISOString() } = {}
) => {
  const nextEntries = (Array.isArray(entries) ? entries : []).map((entry) => ({
    ...entry,
  }));
  const keys = new Set(
    (categoryKeys?.length
      ? categoryKeys
      : nextEntries.filter(hasCompleteMedalCategory).map(buildMedalCategoryKey)
    )
      .map((key) => String(key || ""))
      .filter(Boolean)
  );
  const changedRows = [];
  const completedCategoryKeys = [];

  for (const categoryKey of keys) {
    const groupIndexes = nextEntries
      .map((entry, index) =>
        hasCompleteMedalCategory(entry) &&
        buildMedalCategoryKey(entry) === categoryKey
          ? index
          : -1
      )
      .filter((index) => index >= 0);

    if (!groupIndexes.length) continue;

    const counts = countCategoryMedals(nextEntries, categoryKey);
    const isComplete = isCategoryPodiumComplete(counts);
    if (isComplete) completedCategoryKeys.push(categoryKey);

    for (const index of groupIndexes) {
      const entry = nextEntries[index];
      const medal = String(entry?.medal || "").trim();
      const medalSource = String(entry?.medalSource || "").trim();

      if (medalSource === "tiesheet") continue;

      if (isComplete && !medal) {
        const updated = {
          ...entry,
          medal: "X-X-X-X",
          medalSource: AUTO_CATEGORY_MEDAL_SOURCE,
          medalUpdatedAt: now,
        };
        nextEntries[index] = updated;
        changedRows.push(updated);
        continue;
      }

      if (
        !isComplete &&
        medal === "X-X-X-X" &&
        medalSource === AUTO_CATEGORY_MEDAL_SOURCE
      ) {
        const updated = {
          ...entry,
          medal: "",
          medalSource: "",
          medalUpdatedAt: null,
        };
        nextEntries[index] = updated;
        changedRows.push(updated);
      }
    }
  }

  return {
    entries: nextEntries,
    changedRows,
    completedCategoryKeys,
  };
};

export const buildBracketGroupSignatures = (entries = []) => {
  const groups = new Map();

  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = buildBracketCategoryKey(entry);
    const group = groups.get(key) || [];
    group.push(entry);
    groups.set(key, group);
  }

  return Object.fromEntries(
    [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, rows]) => [key, buildBracketEntrySignature(rows)])
  );
};
