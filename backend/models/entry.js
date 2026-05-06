// backend/models/entry.js

import mongoose from "mongoose";

const entrySchema = new mongoose.Schema(
  {
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: [true, "Tournament ID is required"],
      index: true,
    },

    entries: {
      type: [
        {
          srNo: {
            type: Number,
            required: true,
          },

          entryId: {
            type: String,
            required: true,
            index: true,
          },

          entrySource: {
            type: String,
            enum: ["", "manual", "teamSubmission", "import"],
            default: "",
          },

          sourceSubmissionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TeamEntrySubmission",
            default: null,
          },

          sourcePlayerId: {
            type: String,
            trim: true,
            default: "",
          },

          title: {
            type: String,
            trim: true,
            default: "",
          },

          name: {
            type: String,
            trim: true,
            default: "",
          },

          fathersName: {
            type: String,
            trim: true,
            default: "",
          },

          school: {
            type: String,
            trim: true,
            default: "",
          },

          schoolName: {
            type: String,
            trim: true,
            default: "",
          },

          class: {
            type: String,
            trim: true,
            default: "",
          },

          team: {
            type: String,
            trim: true,
            default: "",
          },

          gender: {
            type: String,
            enum: ["Male", "Female", ""],
            default: "",
          },

          dob: {
            type: Date,
            default: null,
          },

          weight: {
            type: Number,
            min: 0,
            max: 200,
            default: null,
          },

          event: {
            type: String,
            trim: true,
            default: "",
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
          },

          weightCategory: {
            type: String,
            trim: true,
            default: "",
          },

          medal: {
            type: String,
            enum: ["Gold", "Silver", "Bronze", "X-X-X-X", ""],
            default: "",
          },

          medalSource: {
            type: String,
            enum: ["", "manual", "tiesheet"],
            default: "",
          },

          medalUpdatedAt: {
            type: Date,
            default: null,
          },

          coach: {
            type: String,
            trim: true,
            default: "",
          },

          coachContact: {
            type: String,
            trim: true,
            default: "",
          },

          manager: {
            type: String,
            trim: true,
            default: "",
          },

          managerContact: {
            type: String,
            trim: true,
            default: "",
          },
        },
      ],
      default: [],
    },

    userState: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

entrySchema.index({ tournamentId: 1 }, { unique: true });
entrySchema.index({ tournamentId: 1, "entries.entryId": 1 });
entrySchema.index({ tournamentId: 1, "entries.sourceSubmissionId": 1 });
entrySchema.index({ tournamentId: 1, "entries.weight": 1 });
entrySchema.index({ tournamentId: 1, "entries.gender": 1, "entries.ageCategory": 1 });
entrySchema.index({ tournamentId: 1, "entries.event": 1 });
entrySchema.index({ tournamentId: 1, "entries.srNo": 1 });
entrySchema.index({ tournamentId: 1, "entries.medal": 1 });
entrySchema.index({ tournamentId: 1, "entries.medalSource": 1 });

const Entry = mongoose.model("Entry", entrySchema);

export default Entry;