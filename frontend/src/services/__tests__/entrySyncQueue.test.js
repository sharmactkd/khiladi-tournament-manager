import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  queueEntryUpsert,
  listEntryOperations,
  markEntryOperationsSending,
} from "../entrySyncDb";
import { EntrySyncQueue } from "../entrySyncQueue";
import { getEntrySyncScope } from "../../utils/entrySyncUtils";

describe("EntrySyncQueue 1,000-entry stress behavior", () => {
  it("uses sequential batches, confirms all rows and never exceeds concurrency 1", async () => {
    const tournamentId = `tournament-${Date.now()}`;
    const userId = "stress-user";
    const scopeKey = getEntrySyncScope(tournamentId, userId);
    const requestSizes = [];
    let activeRequests = 0;
    let maxConcurrentRequests = 0;

    for (let index = 0; index < 1000; index += 1) {
      await queueEntryUpsert({
        tournamentId,
        userId,
        entryId: `entry-${index}`,
        updates: {
          srNo: index + 1,
          name: `PLAYER ${index + 1}`,
          team: `TEAM ${(index % 20) + 1}`,
        },
      });
    }

    const transport = async (_id, payload) => {
      activeRequests += 1;
      maxConcurrentRequests = Math.max(maxConcurrentRequests, activeRequests);
      requestSizes.push(payload.operations.length);
      await new Promise((resolve) => setTimeout(resolve, 1));
      activeRequests -= 1;
      return {
        success: true,
        serverVersion: requestSizes.length,
        confirmedOperationIds: payload.operations.map(
          (operation) => operation.operationId
        ),
      };
    };

    const queue = new EntrySyncQueue({
      tournamentId,
      userId,
      batchSize: 75,
      transport,
    });
    await queue.initialize();
    const result = await queue.flush();

    expect(result.ok).toBe(true);
    expect(requestSizes).toHaveLength(14);
    expect(Math.max(...requestSizes)).toBe(75);
    expect(requestSizes.reduce((sum, size) => sum + size, 0)).toBe(1000);
    expect(maxConcurrentRequests).toBe(1);
    expect(await listEntryOperations(scopeKey)).toHaveLength(0);
    queue.dispose();
  }, 30000);

  it("recovers operations left in sending state after a browser restart", async () => {
    const tournamentId = `recovery-${Date.now()}`;
    const userId = "recovery-user";
    const scopeKey = getEntrySyncScope(tournamentId, userId);
    const operation = await queueEntryUpsert({
      tournamentId,
      userId,
      entryId: "persistent-entry",
      updates: { name: "RECOVERED PLAYER" },
    });
    await markEntryOperationsSending(
      [operation.operationId],
      "batch-before-crash"
    );

    let receivedMutationId = "";
    const restartedQueue = new EntrySyncQueue({
      tournamentId,
      userId,
      transport: async (_id, payload) => {
        receivedMutationId = payload.clientMutationId;
        return {
          success: true,
          serverVersion: 1,
          confirmedOperationIds: payload.operations.map((item) => item.operationId),
        };
      },
    });

    await restartedQueue.initialize();
    expect((await listEntryOperations(scopeKey))[0].status).toBe("pending");
    await restartedQueue.flush();

    expect(receivedMutationId).toBe("batch-before-crash");
    expect(await listEntryOperations(scopeKey)).toHaveLength(0);
    restartedQueue.dispose();
  });
});
