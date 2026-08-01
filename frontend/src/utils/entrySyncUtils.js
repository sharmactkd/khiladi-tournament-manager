export const ENTRY_SYNC_BATCH_SIZE = 75;

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

const INTERNAL_FIELDS = new Set([
  "_id",
  "__v",
  "id",
  "entryId",
  "actions",
  "pendingSync",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "clientVersion",
  "lastMutationId",
  "syncUpdatedAt",
]);

export const sanitizeEntryUpdates = (updates = {}) => {
  const result = {};
  for (const [key, value] of Object.entries(updates || {})) {
    if (INTERNAL_FIELDS.has(key)) continue;
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
  [
    entry?.gender,
    entry?.ageCategory,
    entry?.weightCategory,
    entry?.event,
    entry?.subEvent,
  ]
    .map((value) =>
      String(value || "")
        .normalize("NFKC")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
    )
    .join("|");

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
