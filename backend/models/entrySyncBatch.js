import mongoose from "mongoose";

const entrySyncBatchSchema = new mongoose.Schema(
  {
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    clientMutationId: {
      type: String,
      required: true,
      trim: true,
    },
    clientSeq: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["processing", "completed", "failed"],
      default: "processing",
      index: true,
    },
    confirmedOperationIds: {
      type: [String],
      default: [],
    },
    failedOperations: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    operationsCount: {
      type: Number,
      default: 0,
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

entrySyncBatchSchema.index(
  { tournamentId: 1, userId: 1, clientMutationId: 1 },
  { unique: true }
);
entrySyncBatchSchema.index({ tournamentId: 1, userId: 1, clientSeq: -1 });

const EntrySyncBatch = mongoose.model("EntrySyncBatch", entrySyncBatchSchema);

export default EntrySyncBatch;
