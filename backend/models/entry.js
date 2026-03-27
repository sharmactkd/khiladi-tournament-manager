// backend/models/entry.js

import mongoose from "mongoose";

const entrySchema = new mongoose.Schema(
  {
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: [true, "Tournament ID is required"],
      
      index: true,
      // index: true hata diya kyunki neeche unique index se cover ho jaayega
    },
    entries: {
      type: [
        {
          srNo: { 
            type: Number, 
            required: true 
          },
          title: { 
            type: String, 
            trim: true, 
            default: "" 
          },
          name: { 
            type: String, 
            trim: true, 
            default: "",
          },
          fathersName: { 
            type: String, 
            trim: true, 
            default: "" 
          },
          schoolName: { 
            type: String, 
            trim: true, 
            default: "" 
          },
          class: { 
            type: String, 
            trim: true, 
            default: "" 
          },
          team: { 
            type: String, 
            trim: true, 
            default: "" 
          },
          gender: { 
            type: String, 
            enum: ["Male", "Female", ""], 
            default: "" 
          },
          dob: { 
            type: Date, 
            default: null 
          },
          weight: { 
            type: Number, 
            min: 20,
            max: 200,
            default: null 
          },
          event: { 
            type: String, 
            trim: true, 
            default: "" 
          },
          subEvent: { 
            type: String, 
            trim: true, 
            default: undefined 
          },
          ageCategory: { 
            type: String, 
            trim: true, 
            default: undefined 
          },
          weightCategory: { 
            type: String, 
            trim: true, 
            default: undefined 
          },
          medal: { 
            type: String, 
            enum: ["Gold", "Silver", "Bronze", ""],
            default: "" 
          },
          coach: { 
            type: String, 
            trim: true, 
            default: "" 
          },
          coachContact: { 
            type: String, 
            trim: true, 
            default: "" 
          },
          manager: { 
            type: String, 
            trim: true, 
            default: "" 
          },
          managerContact: { 
            type: String, 
            trim: true, 
            default: "" 
          },
        },
      ],
      default: [],
    },

    userState: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
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

// Indexes for performance and data integrity

// Compound indexes for fast filtering/sorting
entrySchema.index({ tournamentId: 1, "entries.weight": 1 });
entrySchema.index({ tournamentId: 1, "entries.gender": 1, "entries.ageCategory": 1 });
entrySchema.index({ tournamentId: 1, "entries.event": 1 });
entrySchema.index({ tournamentId: 1, "entries.srNo": 1 });

// Critical: Only ONE Entry document per tournament (prevents duplicates)
entrySchema.index({ tournamentId: 1 }, { unique: true });

const Entry = mongoose.model("Entry", entrySchema);

export default Entry;