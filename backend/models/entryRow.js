import mongoose from "mongoose";

const entryRowSchema = new mongoose.Schema(
  {
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },

    entryId: {
      type: String,
      required: true,
      trim: true,
    },

    srNo: {
      type: Number,
      default: 0,
      index: true,
    },

    title: { type: String, trim: true, default: "" },
    name: { type: String, trim: true, default: "", index: true },
    fathersName: { type: String, trim: true, default: "" },

    school: { type: String, trim: true, default: "" },
    schoolName: { type: String, trim: true, default: "" },
    class: { type: String, trim: true, default: "" },

    team: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
      index: true,
    },

    gender: {
      type: String,
      enum: ["", "Male", "Female"],
      default: "",
      index: true,
    },

    dob: {
      type: Date,
      default: null,
    },

    weight: {
      type: Number,
      default: null,
    },

    event: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    subEvent: {
      type: String,
      trim: true,
      default: "",
    },

    ageCategory: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    weightCategory: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    medal: {
      type: String,
      enum: ["", "Gold", "Silver", "Bronze", "X-X-X-X"],
      default: "",
      index: true,
    },

    medalSource: {
      type: String,
      enum: ["", "manual", "tiesheet"],
      default: "",
      index: true,
    },

    medalUpdatedAt: {
      type: Date,
      default: null,
    },

    entrySource: {
      type: String,
      enum: ["", "manual", "teamSubmission", "import"],
      default: "",
      index: true,
    },

    sourceSubmissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeamEntrySubmission",
      default: null,
      index: true,
    },

    sourcePlayerId: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    coach: { type: String, trim: true, default: "" },
    coachContact: { type: String, trim: true, default: "" },
    manager: { type: String, trim: true, default: "" },
    managerContact: { type: String, trim: true, default: "" },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

entryRowSchema.index({ tournamentId: 1, entryId: 1 }, { unique: true });
entryRowSchema.index({ tournamentId: 1, srNo: 1 });
entryRowSchema.index({ tournamentId: 1, team: 1 });
entryRowSchema.index({ tournamentId: 1, medal: 1 });
entryRowSchema.index({ tournamentId: 1, gender: 1 });
entryRowSchema.index({ tournamentId: 1, ageCategory: 1 });
entryRowSchema.index({ tournamentId: 1, weightCategory: 1 });
entryRowSchema.index({
  tournamentId: 1,
  gender: 1,
  ageCategory: 1,
  weightCategory: 1,
});
entryRowSchema.index({
  tournamentId: 1,
  event: 1,
  subEvent: 1,
  ageCategory: 1,
  weightCategory: 1,
});

const EntryRow = mongoose.model("EntryRow", entryRowSchema);

export default EntryRow;