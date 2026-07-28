import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getEntrySnapshot,
  listEntryOperations,
  queueEntryDelete,
  queueEntryUpsert,
  saveEntrySnapshot,
} from "../services/entrySyncDb";
import { EntrySyncQueue } from "../services/entrySyncQueue";
import {
  getEntrySyncScope,
  reconcileEntriesWithPending,
} from "../utils/entrySyncUtils";

const initialState = {
  status: "idle",
  pendingCount: 0,
  lastError: "",
  isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
};

export default function useEntrySync({
  tournamentId,
  userId,
  enabled = true,
}) {
  const [syncState, setSyncState] = useState(initialState);
  const queue = useMemo(
    () =>
      enabled && tournamentId && userId
        ? new EntrySyncQueue({ tournamentId, userId })
        : null,
    [enabled, tournamentId, userId]
  );

  useEffect(() => {
    if (!queue) return undefined;
    const unsubscribe = queue.subscribe(setSyncState);
    queue.initialize().then(setSyncState).catch((error) => {
      setSyncState({
        ...initialState,
        status: "error",
        lastError: `Local recovery failed: ${error.message}`,
      });
    });
    return () => {
      unsubscribe();
      queue.dispose();
    };
  }, [queue]);

  const queueUpsert = useCallback(
    async (entryId, updates) => {
      if (!queue) return null;
      const operation = await queueEntryUpsert({
        tournamentId,
        userId,
        entryId,
        updates,
      });
      await queue.notifyQueued();
      return operation;
    },
    [queue, tournamentId, userId]
  );

  const queueUpserts = useCallback(
    async (entries) => {
      if (!queue) return [];
      const operations = [];
      for (const entry of entries || []) {
        operations.push(
          await queueEntryUpsert({
            tournamentId,
            userId,
            entryId: entry.entryId,
            updates: entry,
          })
        );
      }
      await queue.notifyQueued();
      return operations;
    },
    [queue, tournamentId, userId]
  );

  const queueDelete = useCallback(
    async (entryId) => {
      if (!queue) return null;
      const operation = await queueEntryDelete({
        tournamentId,
        userId,
        entryId,
      });
      await queue.notifyQueued();
      return operation;
    },
    [queue, tournamentId, userId]
  );

  const hydratePendingChanges = useCallback(
    async (serverEntries = []) => {
      if (!queue) return serverEntries;
      const scopeKey = getEntrySyncScope(tournamentId, userId);
      const operations = await listEntryOperations(scopeKey);
      return reconcileEntriesWithPending(serverEntries, operations);
    },
    [queue, tournamentId, userId]
  );

  const restoreLocalSnapshot = useCallback(async () => {
    if (!queue) return null;
    return getEntrySnapshot(tournamentId, userId);
  }, [queue, tournamentId, userId]);

  const persistSnapshot = useCallback(
    async (entries) => {
      if (!queue) return;
      await saveEntrySnapshot({ tournamentId, userId, entries });
    },
    [queue, tournamentId, userId]
  );

  return {
    queueUpsert,
    queueUpserts,
    queueDelete,
    flush: () => queue?.flush() || Promise.resolve({ ok: true, skipped: true }),
    retry: () => queue?.retry() || Promise.resolve({ ok: true, skipped: true }),
    hydratePendingChanges,
    restoreLocalSnapshot,
    persistSnapshot,
    syncStatus: syncState.status,
    pendingCount: syncState.pendingCount,
    isOnline: syncState.isOnline,
    lastError: syncState.lastError,
  };
}
