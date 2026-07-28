import "dotenv/config";
import mongoose from "mongoose";
import EntryRow from "../models/entryRow.js";

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!mongoUri) {
  console.error("MONGODB_URI (or MONGO_URI) is required.");
  process.exitCode = 2;
} else {
  try {
    await mongoose.connect(mongoUri);

    const [duplicateGroups, missingEntryIds] = await Promise.all([
      EntryRow.aggregate([
        {
          $group: {
            _id: { tournamentId: "$tournamentId", entryId: "$entryId" },
            count: { $sum: 1 },
            documentIds: { $push: "$_id" },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $limit: 100 },
      ]),
      EntryRow.countDocuments({
        $or: [{ entryId: { $exists: false } }, { entryId: null }, { entryId: "" }],
      }),
    ]);

    const expectedIndex = await EntryRow.collection.indexExists(
      "tournamentId_1_entryId_1"
    );

    console.log(
      JSON.stringify(
        {
          ready: duplicateGroups.length === 0 && missingEntryIds === 0,
          uniqueIndexPresent: expectedIndex,
          duplicateGroups: duplicateGroups.map((group) => ({
            tournamentId: group._id.tournamentId,
            entryId: group._id.entryId,
            count: group.count,
            documentIds: group.documentIds,
          })),
          missingEntryIds,
          note:
            "This command is read-only. Resolve every reported duplicate or missing entryId before creating the unique index.",
        },
        null,
        2
      )
    );

    if (duplicateGroups.length > 0 || missingEntryIds > 0) process.exitCode = 1;
  } catch (error) {
    console.error("Entry Sync readiness check failed:", error.message);
    process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}
