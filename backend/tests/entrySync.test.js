import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import EntryRow from "../models/entryRow.js";
import Tournament from "../models/tournament.js";
import {
  normalizeEntrySyncUpdates,
  processEntrySyncBatch,
} from "../services/entrySyncService.js";

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

afterEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

describe("Entry Sync V2", () => {
  test("normalizes allowed updates and rejects unknown fields", () => {
    expect(
      normalizeEntrySyncUpdates({
        name: "  Player One ",
        gender: "m",
        weight: "42.5 kg",
      })
    ).toMatchObject({
      name: "Player One",
      gender: "Male",
      weight: 42.5,
    });

    expect(() => normalizeEntrySyncUpdates({ isAdmin: true })).toThrow(
      "Unsupported entry fields"
    );

    expect(
      normalizeEntrySyncUpdates({
        medal: "X-X-X-X",
        medalSource: "category-auto",
      })
    ).toMatchObject({
      medal: "X-X-X-X",
      medalSource: "category-auto",
    });
  });

  test("preserves only valid category-auto X medals", async () => {
    const tournamentId = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();

    await processEntrySyncBatch({
      tournamentId,
      userId,
      clientMutationId: "category-auto-medals",
      clientSeq: Date.now() * 1000,
      operations: [
        {
          operationId: "auto-x",
          entryId: "auto-x",
          type: "upsert",
          updates: { medal: "X-X-X-X", medalSource: "category-auto" },
        },
        {
          operationId: "manual-x",
          entryId: "manual-x",
          type: "upsert",
          updates: { medal: "X-X-X-X", medalSource: "manual" },
        },
        {
          operationId: "invalid-auto-gold",
          entryId: "invalid-auto-gold",
          type: "upsert",
          updates: { medal: "Gold", medalSource: "category-auto" },
        },
      ],
    });

    const rows = await EntryRow.find({ tournamentId }).lean();
    const byId = new Map(rows.map((row) => [row.entryId, row]));

    expect(byId.get("auto-x")).toMatchObject({
      medal: "X-X-X-X",
      medalSource: "category-auto",
    });
    expect(byId.get("manual-x")).toMatchObject({
      medal: "X-X-X-X",
      medalSource: "manual",
    });
    expect(byId.get("invalid-auto-gold")).toMatchObject({
      medal: "Gold",
      medalSource: "manual",
    });
  });

  test("does not overwrite a TieSheet-controlled medal", async () => {
    const tournamentId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    await EntryRow.create({
      tournamentId,
      entryId: "tiesheet-player",
      medal: "Gold",
      medalSource: "tiesheet",
      createdBy: userId,
      updatedBy: userId,
    });

    await processEntrySyncBatch({
      tournamentId: tournamentId.toString(),
      userId: userId.toString(),
      clientMutationId: "protect-tiesheet-medal",
      clientSeq: Date.now() * 1000,
      operations: [
        {
          operationId: "replace-with-auto-x",
          entryId: "tiesheet-player",
          type: "upsert",
          updates: { medal: "X-X-X-X", medalSource: "category-auto" },
        },
      ],
    });

    expect(
      await EntryRow.findOne({ tournamentId, entryId: "tiesheet-player" }).lean()
    ).toMatchObject({
      medal: "Gold",
      medalSource: "tiesheet",
    });
  });

  test("synchronizes 1,000 entries in 10 batches without duplicates", async () => {
    const tournamentId = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    let sequence = Date.now() * 1000;

    for (let batchIndex = 0; batchIndex < 10; batchIndex += 1) {
      const operations = Array.from({ length: 100 }, (_, index) => {
        const playerIndex = batchIndex * 100 + index;
        return {
          operationId: `operation-${playerIndex}`,
          entryId: `entry-${playerIndex}`,
          type: "upsert",
          updates: {
            srNo: playerIndex + 1,
            coach: `Coach ${playerIndex % 20}`,
          },
        };
      });

      const result = await processEntrySyncBatch({
        tournamentId,
        userId,
        clientMutationId: `batch-${batchIndex}`,
        clientSeq: sequence += 1,
        operations,
      });

      expect(result.confirmedOperationIds).toHaveLength(100);
    }

    expect(await EntryRow.countDocuments({ tournamentId })).toBe(1000);
    expect(
      await EntryRow.distinct("entryId", { tournamentId })
    ).toHaveLength(1000);

    const replay = await processEntrySyncBatch({
      tournamentId,
      userId,
      clientMutationId: "batch-9",
      clientSeq: sequence,
      operations: Array.from({ length: 100 }, (_, index) => ({
        operationId: `operation-${900 + index}`,
        entryId: `entry-${900 + index}`,
        type: "upsert",
        updates: { coach: "Should not duplicate" },
      })),
    });

    expect(replay.idempotentReplay).toBe(true);
    expect(await EntryRow.countDocuments({ tournamentId })).toBe(1000);
  }, 60000);

  test("marks bracket changes without deleting saved outcomes", async () => {
    const tournamentId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    await Tournament.collection.insertOne({
      _id: tournamentId,
      createdBy: userId,
      tiesheet: {
        brackets: [{ key: "male_cadet_40" }],
        outcomes: { male_cadet_40: { 1: "home" } },
        entriesSignature: "old-signature",
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await EntryRow.create({
      tournamentId,
      entryId: "entry-a",
      name: "OLD NAME",
      createdBy: userId,
      updatedBy: userId,
    });

    const result = await processEntrySyncBatch({
      tournamentId: tournamentId.toString(),
      userId: userId.toString(),
      clientMutationId: "display-change",
      clientSeq: Date.now() * 1000,
      operations: [
        {
          operationId: "rename-a",
          entryId: "entry-a",
          type: "upsert",
          updates: { name: "NEW NAME" },
        },
      ],
    });

    const tournament = await Tournament.findById(tournamentId).lean();
    expect(result.bracketChangeType).toBe("display");
    expect(result.changedEntryIds).toEqual(["entry-a"]);
    expect(tournament.tiesheet.outcomes).toEqual({
      male_cadet_40: { 1: "home" },
    });
    expect(tournament.tiesheet.invalidationType).toBe("display");
  });
});
