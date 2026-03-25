import mongoose from "mongoose";

const teamEntrySubmissionSchema = new mongoose.Schema(
  {
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },
    coachId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    coachName: {
      type: String,
      required: true,
      trim: true,
    },
    coachEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    teamName: {
      type: String,
      required: true,
      trim: true,
    },
    players: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    status: {
      type: String,
      enum: ["submitted", "approved", "rejected"],
      default: "submitted",
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

teamEntrySubmissionSchema.index({ tournamentId: 1, status: 1 });
teamEntrySubmissionSchema.index({ coachId: 1, createdAt: -1 });

const TeamEntrySubmission = mongoose.model(
  "TeamEntrySubmission",
  teamEntrySubmissionSchema
);

export default TeamEntrySubmission;