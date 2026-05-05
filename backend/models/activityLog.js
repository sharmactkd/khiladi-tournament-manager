import mongoose from "mongoose";

const { Schema } = mongoose;

export const ACTIVITY_ACTIONS = Object.freeze([
  "USER_LOGIN",
  "USER_LOGOUT",
  "TOURNAMENT_CREATED",
  "TOURNAMENT_UPDATED",
  "TOURNAMENT_DELETED",
  "ENTRIES_SAVED",
  "ENTRY_IMPORTED",
  "TEAM_SUBMISSION_CREATED",
  "TEAM_SUBMISSION_APPROVED",
  "TEAM_SUBMISSION_REJECTED",
  "PAYMENT_UPDATED",
  "WINNER_UPDATED",
  "TIESHEET_UPDATED",
  "OFFICIALS_UPDATED",
  "ADMIN_VIEWED_USER",
  "ADMIN_ACTION",
]);

export const ACTIVITY_MODULES = Object.freeze([
  "auth",
  "tournament",
  "entry",
  "teamSubmission",
  "payment",
  "result",
  "tiesheet",
  "official",
  "admin",
  "system",
]);

const activityLogSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    actor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    tournament: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
      index: true,
      default: null,
    },
    action: {
      type: String,
      enum: ACTIVITY_ACTIONS,
      required: true,
      index: true,
      trim: true,
    },
    module: {
      type: String,
      enum: ACTIVITY_MODULES,
      default: "system",
      index: true,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 180,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1200,
      default: "",
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 600,
      default: "",
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    minimize: false,
  }
);

activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ tournament: 1, createdAt: -1 });
activityLogSchema.index({ action: 1 });
activityLogSchema.index({ module: 1 });
activityLogSchema.index({ createdAt: -1 });

const ActivityLog =
  mongoose.models.ActivityLog ||
  mongoose.model("ActivityLog", activityLogSchema);

export default ActivityLog;