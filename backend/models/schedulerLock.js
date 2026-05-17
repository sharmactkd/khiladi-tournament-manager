import mongoose from "mongoose";

const schedulerLockSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    lockedUntil: {
      type: Date,
      required: true,
      index: true,
    },

    lockedBy: {
      type: String,
      default: "",
      trim: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

const SchedulerLock = mongoose.model("SchedulerLock", schedulerLockSchema);

export default SchedulerLock;