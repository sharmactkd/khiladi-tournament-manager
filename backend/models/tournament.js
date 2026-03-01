// backend/models/tournament.js

import mongoose from "mongoose";

const feeSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Free", "Paid"], default: "Free", required: true },
    amount: {
      type: Number,
      required: function () {
        return this.type === "Paid";
      },
      min: [0, "Amount cannot be negative"],
    },
  },
  { _id: false }
);

const tournamentSchema = new mongoose.Schema(
  {
    organizer: { type: String, required: [true, "Organizer name is required"] },
    federation: { type: String, required: [true, "Federation name is required"] },
    tournamentName: { type: String, required: [true, "Tournament name is required"] },
    email: {
      type: String,
      required: [true, "Contact email is required"],
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Invalid email format"],
    },
    contact: {
      type: String,
      required: [true, "Contact number is required"],
    },
    dateFrom: { type: Date, required: [true, "Start date is required"] },
    dateTo: { type: Date, required: [true, "End date is required"] },
    venue: {
      name: { type: String, required: [true, "Venue name is required"] },
      country: { type: String, required: [true, "Country is required"] },
      state: { type: String, required: [true, "State is required"] },
      district: { type: String, required: [true, "District is required"] },
    },
    tournamentLevel: {
      type: String,
      enum: ["Inter School", "District", "Regional", "State", "National", "International"],
      default: "Inter School",
    },
    tournamentType: {
      type: [String],
      enum: ["Open", "Official"],
      default: undefined,
    },
    playerLimit: { type: Number, default: undefined },
    ageCategories: {
      open: {
        type: [String],
        enum: ["Sub-Junior", "Cadet", "Junior", "Senior", "Under - 14", "Under - 17", "Under - 19"],
        default: undefined,
      },
      official: {
        type: [String],
        enum: ["Sub-Junior", "Cadet", "Junior", "Senior", "Under - 14", "Under - 17", "Under - 19"],
        default: undefined,
      },
    },
    ageGender: {
      open: { type: Object, default: {} },
      official: { type: Object, default: {} },
    },
    eventCategories: {
      kyorugi: {
        selected: { type: Boolean, default: false },
        sub: {
          Kyorugi: { type: Boolean, default: false },
          Fresher: { type: Boolean, default: false },
          TagTeam: { type: Boolean, default: false },
        },
      },
      poomsae: {
        selected: { type: Boolean, default: false },
        categories: { type: [String], enum: ["Individual", "Pair", "Team"], default: undefined },
      },
    },
    entryFees: {
      currency: {
        type: String,
        default: "INR",
        validate: {
          validator: (v) => /^[A-Z]{3}$/.test(v),
          message: "Invalid ISO 4217 currency code",
        },
        uppercase: true,
      },
      currencySymbol: String,
      amounts: {
        kyorugi: { type: Map, of: feeSchema, default: undefined },
        poomsae: { type: Map, of: feeSchema, default: undefined },
      },
    },

    // ========== WEIGHT CATEGORIES ==========
    // Supports:
    // - Standard mode: selected.male / selected.female arrays
    // - Custom mode (NEW): custom[ageGroup] = { Male: [rows], Female: [rows] }
    //   Also supports legacy format: custom[ageGroup] = [rows]
    weightCategories: {
      type: {
        type: String,
        enum: ["WT", "SGFI", "custom"],
        default: "WT",
        required: true,
      },
      custom: {
        // Use Mixed so it can store either:
        // - legacy: [ {min,max,category,description}, ... ]
        // - new: { Male: [...], Female: [...] }
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {},
      },
      selected: {
        male: { type: [String], default: [] },
        female: { type: [String], default: [] },
      },
    },
    // ======================================

    foodAndLodging: {
      option: { type: String, enum: ["No", "Only Food", "Only Stay", "Food and Stay"], default: "No" },
      type: { type: String, enum: ["Free", "Paid"], default: "Free" },
      paymentMethod: { type: String, enum: ["per day", "total", ""], default: "" },
      amount: {
        type: Number,
        min: [0, "Amount cannot be negative"],
        required: function () {
          return this.type === "Paid";
        },
        default: undefined,
      },
    },
    medalPoints: {
      gold: { type: Number, default: 12, min: 0 },
      silver: { type: Number, default: 7, min: 0 },
      bronze: { type: Number, default: 5, min: 0 },
    },
    description: { type: String, default: "", trim: true },
    matchSchedule: { type: String, default: "", trim: true },
    visibility: { type: Boolean, default: true },
    poster: String,
    logos: [String],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    outcomes: { type: Map, of: Map, of: String, default: {} },
    tiesheet: { type: mongoose.Schema.Types.Mixed, default: {} },
    officials: {
      type: [
        {
          name: { type: String, trim: true },
          rank: { type: String, trim: true },
          dan: { type: String, trim: true },
          danNumber: { type: String, trim: true },
          mark: { type: String, trim: true },
        },
      ],
      default: [],
    },
    teamPayments: {
      type: Map,
      of: new mongoose.Schema({
        foodMembers: { type: Number, default: 0 },
        mode: { type: String, enum: ["Cash", "Online", "Cash + Online"], default: "Cash" },
        cash: { type: Number, default: 0 },
        online: { type: Number, default: 0 },
        txnId: { type: String, trim: true, default: "" },
      }),
      default: () => new Map(),
    },
    tieSheetRecords: {
      type: [
        {
          bracketKey: String,
          category: String,
          playerCount: Number,
          htmlContent: String,
          printedAt: String,
          actionType: { type: String, enum: ["print", "save"] },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for faster queries
tournamentSchema.index({ createdBy: 1, visibility: 1 });
tournamentSchema.index({ dateFrom: 1, dateTo: 1 });
tournamentSchema.index({ "venue.country": 1, "venue.state": 1, "venue.district": 1 });

// Virtual for upcoming tournaments
tournamentSchema.virtual("isUpcoming").get(function () {
  return this.dateFrom > new Date();
});

// Tournament type validation
tournamentSchema.path("tournamentType").validate(function (arr) {
  if (!arr || arr.length === 0) return true;
  return arr.every((v) => ["Open", "Official"].includes(v));
}, "Invalid tournament type");

// Pre-validate hook
tournamentSchema.pre("validate", function (next) {
  const fieldsToParse = [
    "ageCategories",
    "ageGender",
    "eventCategories",
    "weightCategories",
    "entryFees",
    "foodAndLodging",
    "medalPoints",
    "venue",
  ];

  fieldsToParse.forEach((field) => {
    const value = this.get(field);
    if (typeof value === "string" && value.trim() !== "") {
      try {
        this.set(field, JSON.parse(value));
      } catch (err) {
        this.invalidate(field, `Invalid JSON format for ${field}`);
      }
    } else if (typeof value === "string" && value.trim() === "") {
      this.set(field, undefined);
    }
  });

  // Contact cleaning
  if (this.contact) {
    const cleaned = this.contact.replace(/[^+\d]/g, "");
    const match = cleaned.match(/^\+(\d{1,3})(\d+)$/);
    if (match) {
      this.contact = `+${match[1]}${match[2]}`;
    } else {
      this.invalidate("contact", "Invalid phone number format (must be +[country code][number])");
    }
  }

  // Entry fees cleanup
  if (this.entryFees && this.entryFees.amounts) {
    if (
      this.eventCategories &&
      this.eventCategories.poomsae &&
      (!this.eventCategories.poomsae.selected ||
        !this.eventCategories.poomsae.categories ||
        this.eventCategories.poomsae.categories.length === 0)
    ) {
      this.entryFees.amounts.poomsae = undefined;
    }
    if (this.eventCategories && this.eventCategories.kyorugi && !this.eventCategories.kyorugi.selected) {
      this.entryFees.amounts.kyorugi = undefined;
    }
  }

  if (this.dateTo < this.dateFrom) {
    this.invalidate("dateTo", "End date must be same day or after start date");
  }

  if (this.foodAndLodging && !this.foodAndLodging.type) {
    this.foodAndLodging.type = "Free";
  }

  next();
});

// Pre-save hook – cleanup and normalization
tournamentSchema.pre("save", function (next) {
  // Clean empty arrays
  if (this.ageCategories) {
    if (Array.isArray(this.ageCategories.open) && this.ageCategories.open.length === 0) {
      this.ageCategories.open = undefined;
    }
    if (Array.isArray(this.ageCategories.official) && this.ageCategories.official.length === 0) {
      this.ageCategories.official = undefined;
    }
  }

  if (Array.isArray(this.tournamentType) && this.tournamentType.length === 0) {
    this.tournamentType = undefined;
  }

  if (this.eventCategories?.poomsae?.categories?.length === 0) {
    this.eventCategories.poomsae.categories = undefined;
  }

  if (this.ageGender) {
    if (this.ageGender.open && Object.keys(this.ageGender.open).length === 0) {
      this.ageGender.open = undefined;
    }
    if (this.ageGender.official && Object.keys(this.ageGender.official).length === 0) {
      this.ageGender.official = undefined;
    }
  }

  // ====== WEIGHT CATEGORIES FINAL CLEANUP ======
  if (this.weightCategories) {
    const wc = this.weightCategories;

    if (wc.type === "custom") {
      wc.selected = undefined;
      // keep wc.custom as-is (may be legacy array per age or new gender object per age)
    } else {
      wc.custom = undefined;
      if (wc.selected) {
        if (Array.isArray(wc.selected.male) && wc.selected.male.length === 0) wc.selected.male = undefined;
        if (Array.isArray(wc.selected.female) && wc.selected.female.length === 0) wc.selected.female = undefined;
      }
    }
  }
  // ============================================

  // Existing cleanup logic...
  if (this.weightCategories?.selected) {
    if (this.weightCategories.selected.male?.length === 0) {
      this.weightCategories.selected.male = undefined;
    }
    if (this.weightCategories.selected.female?.length === 0) {
      this.weightCategories.selected.female = undefined;
    }
  }

  if (this.weightCategories?.type !== "custom") {
    this.weightCategories.custom = undefined;
  }

  // Entry fees amount cleanup
  if (this.entryFees?.amounts?.kyorugi) {
    for (let [key, fee] of this.entryFees.amounts.kyorugi.entries()) {
      fee.amount = Math.max(0, fee.amount || 0);
      if (fee.type === "Free") fee.amount = undefined;
      this.entryFees.amounts.kyorugi.set(key, fee);
    }
  }
  if (this.entryFees?.amounts?.poomsae) {
    for (let [key, fee] of this.entryFees.amounts.poomsae.entries()) {
      fee.amount = Math.max(0, fee.amount || 0);
      if (fee.type === "Free") fee.amount = undefined;
      this.entryFees.amounts.poomsae.set(key, fee);
    }
  }

  // Currency symbol auto-generation
  if (this.entryFees?.currency && !this.entryFees.currencySymbol) {
    try {
      this.entryFees.currencySymbol = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: this.entryFees.currency,
      })
        .format(0)
        .replace(/[0-9.,]/g, "")
        .trim();
    } catch {
      this.entryFees.currencySymbol = "₹";
    }
  }

  // Food & Lodging cleanup
  if (this.foodAndLodging) {
    if (this.foodAndLodging.type === "Free" || this.foodAndLodging.option === "No") {
      this.foodAndLodging.amount = undefined;
      this.foodAndLodging.paymentMethod = undefined;
      this.foodAndLodging.type = "Free";
    }
    if (this.foodAndLodging.amount === "" || this.foodAndLodging.amount < 0) {
      this.foodAndLodging.amount = undefined;
    }
  }

  if (Array.isArray(this.logos) && this.logos.length === 0) {
    this.logos = undefined;
  }

  // Kyorugi sub cleanup
  if (this.eventCategories?.kyorugi?.sub) {
    const cleanedSub = {};
    let hasTrue = false;
    Object.keys(this.eventCategories.kyorugi.sub).forEach((key) => {
      if (this.eventCategories.kyorugi.sub[key] === true) {
        cleanedSub[key] = true;
        hasTrue = true;
      }
    });
    this.eventCategories.kyorugi.sub = cleanedSub;
    if (this.eventCategories.kyorugi.selected && !hasTrue) {
      this.eventCategories.kyorugi = undefined;
    }
  }

  // Final eventCategories cleanup
  if (this.eventCategories) {
    if (!this.eventCategories.kyorugi && !this.eventCategories.poomsae) {
      this.eventCategories = undefined;
    }
  }

  // Clear currency if no paid fees
  let hasPaid = false;
  if (this.entryFees?.amounts?.kyorugi) {
    for (let fee of this.entryFees.amounts.kyorugi.values()) {
      if (fee.type === "Paid" && fee.amount > 0) hasPaid = true;
    }
  }
  if (this.entryFees?.amounts?.poomsae) {
    for (let fee of this.entryFees.amounts.poomsae.values()) {
      if (fee.type === "Paid" && fee.amount > 0) hasPaid = true;
    }
  }
  if (!hasPaid) {
    this.entryFees.currency = undefined;
    this.entryFees.currencySymbol = undefined;
  }

  next();
});

const Tournament = mongoose.model("Tournament", tournamentSchema);
export default Tournament;