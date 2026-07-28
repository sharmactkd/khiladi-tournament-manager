import { openDB } from "idb";
import {
  createStableId,
  getEntrySyncScope,
  mergeEntryUpdates,
  sanitizeEntryUpdates,
} from "../utils/entrySyncUtils";

const DATABASE_NAME = "khiladi-entry-sync";
const DATABASE_VERSION = 1;
const PENDING_STORE = "pendingEntryChanges";
const SNAPSHOT_STORE = "entrySnapshots";
const METADATA_STORE = "entrySyncMetadata";

let dbPromise;

const getDb = () => {
  if (!dbPromise) {
    dbPromise = openDB(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(db) {
        const pending = db.createObjectStore(PENDING_STORE, {
          keyPath: "operationId",
        });
        pending.createIndex("scopeKey", "scopeKey");
        pending.createIndex("entryScopeKey", "entryScopeKey");
        pending.createIndex("status", "status");

        db.createObjectStore(SNAPSHOT_STORE, { keyPath: "scopeKey" });
        db.createObjectStore(METADATA_STORE, { keyPath: "scopeKey" });
      },
    });
  }
  return dbPromise;
};

const createSequence = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

export const recoverInterruptedEntryOperations = async (scopeKey) => {
  const db = await getDb();
  const transaction = db.transaction(PENDING_STORE, "readwrite");
  const index = transaction.store.index("scopeKey");
  const operations = await index.getAll(scopeKey);
  await Promise.all(
    operations
      .filter((operation) => operation.status === "sending")
      .map((operation) =>
        transaction.store.put({
          ...operation,
          status: "pending",
          updatedAt: new Date().toISOString(),
        })
      )
  );
  await transaction.done;
};

export const listEntryOperations = async (
  scopeKey,
  statuses = ["pending", "sending", "failed"]
) => {
  const db = await getDb();
  const operations = await db
    .transaction(PENDING_STORE)
    .store.index("scopeKey")
    .getAll(scopeKey);
  return operations
    .filter((operation) => statuses.includes(operation.status))
    .sort((left, right) => left.clientSeq - right.clientSeq);
};

export const queueEntryUpsert = async ({
  tournamentId,
  userId,
  entryId,
  updates,
}) => {
  const scopeKey = getEntrySyncScope(tournamentId, userId);
  const entryScopeKey = `${scopeKey}:${entryId}`;
  const db = await getDb();
  const transaction = db.transaction(PENDING_STORE, "readwrite");
  const allForEntry = await transaction.store
    .index("entryScopeKey")
    .getAll(entryScopeKey);
  const mergeTarget = allForEntry
    .filter((operation) => operation.status === "pending")
    .sort((left, right) => right.clientSeq - left.clientSeq)[0];
  const now = new Date().toISOString();

  const operation = mergeTarget
    ? {
        ...mergeTarget,
        type: "upsert",
        updates: mergeEntryUpdates(mergeTarget.updates, updates),
        clientSeq: createSequence(),
        updatedAt: now,
        retryCount: 0,
        lastError: "",
      }
    : {
        operationId: createStableId("entry-op"),
        scopeKey,
        entryScopeKey,
        tournamentId,
        userId,
        entryId,
        type: "upsert",
        updates: sanitizeEntryUpdates(updates),
        clientSeq: createSequence(),
        createdAt: now,
        updatedAt: now,
        retryCount: 0,
        status: "pending",
        lastError: "",
      };

  await transaction.store.put(operation);
  await transaction.done;
  return operation;
};

export const queueEntryDelete = async ({
  tournamentId,
  userId,
  entryId,
}) => {
  const scopeKey = getEntrySyncScope(tournamentId, userId);
  const entryScopeKey = `${scopeKey}:${entryId}`;
  const db = await getDb();
  const transaction = db.transaction(PENDING_STORE, "readwrite");
  const operations = await transaction.store
    .index("entryScopeKey")
    .getAll(entryScopeKey);
  await Promise.all(
    operations
      .filter((operation) => operation.status !== "sending")
      .map((operation) => transaction.store.delete(operation.operationId))
  );
  const now = new Date().toISOString();
  const operation = {
    operationId: createStableId("entry-op"),
    scopeKey,
    entryScopeKey,
    tournamentId,
    userId,
    entryId,
    type: "delete",
    updates: {},
    clientSeq: createSequence(),
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
    status: "pending",
    lastError: "",
  };
  await transaction.store.put(operation);
  await transaction.done;
  return operation;
};

export const markEntryOperationsSending = async (
  operationIds,
  batchMutationId
) => {
  const db = await getDb();
  const transaction = db.transaction(PENDING_STORE, "readwrite");
  for (const operationId of operationIds) {
    const operation = await transaction.store.get(operationId);
    if (operation?.status === "pending") {
      await transaction.store.put({
        ...operation,
        status: "sending",
        batchMutationId:
          operation.batchMutationId || String(batchMutationId || ""),
      });
    }
  }
  await transaction.done;
};

export const confirmEntryOperations = async (operationIds) => {
  const db = await getDb();
  const transaction = db.transaction(PENDING_STORE, "readwrite");
  await Promise.all(operationIds.map((id) => transaction.store.delete(id)));
  await transaction.done;
};

export const releaseEntryOperations = async (
  operationIds,
  { failed = false, error = "" } = {}
) => {
  const db = await getDb();
  const transaction = db.transaction(PENDING_STORE, "readwrite");
  for (const operationId of operationIds) {
    const operation = await transaction.store.get(operationId);
    if (!operation) continue;
    await transaction.store.put({
      ...operation,
      status: failed ? "failed" : "pending",
      retryCount: Number(operation.retryCount || 0) + 1,
      lastError: String(error || ""),
      updatedAt: new Date().toISOString(),
    });
  }
  await transaction.done;
};

export const retryFailedEntryOperations = async (scopeKey) => {
  const db = await getDb();
  const transaction = db.transaction(PENDING_STORE, "readwrite");
  const operations = await transaction.store.index("scopeKey").getAll(scopeKey);
  for (const operation of operations) {
    if (operation.status === "failed") {
      await transaction.store.put({
        ...operation,
        status: "pending",
        retryCount: 0,
        lastError: "",
      });
    }
  }
  await transaction.done;
};

export const saveEntrySnapshot = async ({
  tournamentId,
  userId,
  entries,
}) => {
  const scopeKey = getEntrySyncScope(tournamentId, userId);
  const db = await getDb();
  await db.put(SNAPSHOT_STORE, {
    scopeKey,
    tournamentId,
    userId,
    entries,
    updatedAt: new Date().toISOString(),
  });
};

export const getEntrySnapshot = async (tournamentId, userId) => {
  const scopeKey = getEntrySyncScope(tournamentId, userId);
  const db = await getDb();
  return db.get(SNAPSHOT_STORE, scopeKey);
};

export const saveEntrySyncMetadata = async (scopeKey, metadata) => {
  const db = await getDb();
  await db.put(METADATA_STORE, {
    scopeKey,
    ...metadata,
    updatedAt: new Date().toISOString(),
  });
};

export const getEntrySyncMetadata = async (scopeKey) => {
  const db = await getDb();
  return db.get(METADATA_STORE, scopeKey);
};
