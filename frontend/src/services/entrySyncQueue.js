import { bulkSyncEntryChanges } from "../api";
import {
  confirmEntryOperations,
  listEntryOperations,
  markEntryOperationsSending,
  recoverInterruptedEntryOperations,
  releaseEntryOperations,
  retryFailedEntryOperations,
  saveEntrySyncMetadata,
} from "./entrySyncDb";
import {
  createStableId,
  getEntrySyncScope,
  getRetryDelayMs,
  isRetryableEntrySyncError,
} from "../utils/entrySyncUtils";

const MAX_AUTOMATIC_RETRIES = 5;
const DEBOUNCE_MS = 1500;
const getInitialOnlineState = () =>
  typeof navigator === "undefined" || typeof navigator.onLine !== "boolean"
    ? true
    : navigator.onLine;

export class EntrySyncQueue {
  constructor({
    tournamentId,
    userId,
    batchSize = 75,
    transport = bulkSyncEntryChanges,
  }) {
    this.tournamentId = tournamentId;
    this.userId = userId;
    this.scopeKey = getEntrySyncScope(tournamentId, userId);
    this.batchSize = batchSize;
    this.transport = transport;
    this.listeners = new Set();
    this.flushPromise = null;
    this.debounceTimer = null;
    this.retryTimer = null;
    this.disposed = false;
    const initiallyOnline = getInitialOnlineState();
    this.state = {
      status: initiallyOnline ? "idle" : "offline",
      pendingCount: 0,
      lastError: "",
      isOnline: initiallyOnline,
    };
    this.handleOnline = () => {
      this.setState({ isOnline: true, status: "pending" });
      this.flush();
    };
    this.handleOffline = () => {
      this.setState({ isOnline: false, status: "offline" });
    };
  }

  async initialize() {
    this.disposed = false;
    await recoverInterruptedEntryOperations(this.scopeKey);
    await this.refreshState();
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
    }
    if (this.state.pendingCount > 0 && this.state.isOnline) this.schedule();
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot = () => this.state;

  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener(this.state));
  }

  async refreshState() {
    const operations = await listEntryOperations(this.scopeKey);
    const pendingCount = operations.length;
    const failed = operations.some((operation) => operation.status === "failed");
    const status = !this.state.isOnline
      ? "offline"
      : this.flushPromise
        ? "saving"
        : failed
          ? "error"
          : pendingCount > 0
            ? "pending"
            : "saved";
    this.setState({ pendingCount, status });
    return operations;
  }

  schedule() {
    if (this.disposed) return;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flush(), DEBOUNCE_MS);
  }

  async notifyQueued() {
    await this.refreshState();
    this.setState({
      status: this.state.isOnline ? "pending" : "offline",
      lastError: "",
    });
    this.schedule();
  }

  async flush() {
    if (this.disposed) return { ok: false, reason: "disposed" };
    if (this.flushPromise) return this.flushPromise;
    if (!this.state.isOnline) {
      await this.refreshState();
      this.setState({ status: "offline" });
      return { ok: true, persistedLocally: true, offline: true };
    }

    clearTimeout(this.debounceTimer);
    this.flushPromise = this.processLoop();
    try {
      return await this.flushPromise;
    } finally {
      this.flushPromise = null;
      await this.refreshState();
    }
  }

  async processLoop() {
    this.setState({ status: "saving", lastError: "" });

    while (!this.disposed && this.state.isOnline) {
      const allOperations = await listEntryOperations(this.scopeKey, ["pending"]);
      if (!allOperations.length) {
        await saveEntrySyncMetadata(this.scopeKey, {
          lastSuccessfulSyncAt: new Date().toISOString(),
        });
        return { ok: true };
      }

      const firstBatchMutationId = allOperations[0]?.batchMutationId || "";
      const batch = allOperations
        .filter((operation) =>
          firstBatchMutationId
            ? operation.batchMutationId === firstBatchMutationId
            : !operation.batchMutationId
        )
        .slice(0, this.batchSize);
      const operationIds = batch.map((operation) => operation.operationId);
      const clientSeq = Math.max(...batch.map((operation) => operation.clientSeq));
      const clientMutationId =
        firstBatchMutationId || createStableId("entry-batch");
      await markEntryOperationsSending(operationIds, clientMutationId);

      try {
        const response = await this.transport(this.tournamentId, {
          clientMutationId,
          clientSeq,
          operations: batch.map((operation) => ({
            operationId: operation.operationId,
            entryId: operation.entryId,
            type: operation.type,
            updates: operation.updates,
          })),
        });

        const confirmed = Array.isArray(response?.confirmedOperationIds)
          ? response.confirmedOperationIds
          : [];
        await confirmEntryOperations(confirmed);
        const unconfirmed = operationIds.filter((id) => !confirmed.includes(id));
        if (unconfirmed.length) {
          await releaseEntryOperations(unconfirmed, {
            failed: true,
            error: "Server did not confirm these operations",
          });
          throw Object.assign(new Error("Some entry operations were not confirmed"), {
            retryable: false,
            status: 422,
          });
        }

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent(`entryDataUpdated_${this.tournamentId}`, {
              detail: {
                serverVersion: response?.serverVersion,
                bracketDataChanged: response?.bracketDataChanged === true,
              },
            })
          );
        }
      } catch (error) {
        const attempt = Math.max(
          1,
          ...batch.map((operation) => Number(operation.retryCount || 0) + 1)
        );
        const retryable = isRetryableEntrySyncError(error);
        const exhausted = attempt >= MAX_AUTOMATIC_RETRIES;
        await releaseEntryOperations(operationIds, {
          failed: !retryable || exhausted,
          error: error.message,
        });
        this.setState({
          status: !retryable || exhausted ? "error" : "pending",
          lastError: error.message,
        });

        if (!retryable || exhausted) {
          return { ok: false, error };
        }

        const delay = getRetryDelayMs(attempt, error.retryAfterMs);
        await new Promise((resolve) => {
          this.retryTimer = setTimeout(resolve, delay);
        });
      }
    }

    return { ok: true, persistedLocally: true, offline: true };
  }

  async retry() {
    await retryFailedEntryOperations(this.scopeKey);
    this.setState({ status: this.state.isOnline ? "pending" : "offline", lastError: "" });
    return this.flush();
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.debounceTimer);
    clearTimeout(this.retryTimer);
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
    }
    this.listeners.clear();
  }
}
