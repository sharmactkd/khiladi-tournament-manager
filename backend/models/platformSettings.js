import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: true },
    price: { type: Number, required: true, min: 0 },
    durationDays: { type: Number, default: null },
    currency: { type: String, default: "INR", trim: true, uppercase: true },
    accessType: {
      type: String,
      enum: ["tournament", "unlimited"],
      default: "unlimited",
    },
    description: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const defaultPlans = () => ({
  single: {
    label: "Single Tournament",
    enabled: true,
    price: 1000,
    durationDays: null,
    currency: "INR",
    accessType: "tournament",
    description: "Premium access for one tournament",
  },
  six_months: {
    label: "6 Months",
    enabled: true,
    price: 2000,
    durationDays: 180,
    currency: "INR",
    accessType: "unlimited",
    description: "Unlimited premium access for 6 months",
  },
  one_year: {
    label: "1 Year",
    enabled: true,
    price: 3000,
    durationDays: 365,
    currency: "INR",
    accessType: "unlimited",
    description: "Unlimited premium access for 1 year",
  },
});

const platformSettingsSchema = new mongoose.Schema(
  {
    singletonKey: {
      type: String,
      default: "platform",
      unique: true,
      immutable: true,
    },

    paymentsEnabled: { type: Boolean, default: true },
    maintenanceFreeAccess: { type: Boolean, default: false },
    registrationEnabled: { type: Boolean, default: true },
    couponSystemEnabled: { type: Boolean, default: true },

    defaultCurrency: {
      type: String,
      default: "INR",
      trim: true,
      uppercase: true,
    },

    trialEnabled: { type: Boolean, default: false },
    defaultTrialDays: { type: Number, default: 7, min: 1, max: 365 },

    defaultMonthlyPrice: { type: Number, default: 499, min: 0 },
    defaultYearlyPrice: { type: Number, default: 4999, min: 0 },
    defaultLifetimePrice: { type: Number, default: 14999, min: 0 },

    plans: {
      type: Map,
      of: planSchema,
      default: defaultPlans,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

platformSettingsSchema.statics.getSettings = async function () {
  return this.findOneAndUpdate(
    { singletonKey: "platform" },
    {
      $setOnInsert: {
        singletonKey: "platform",
        plans: defaultPlans(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

const PlatformSettings = mongoose.model(
  "PlatformSettings",
  platformSettingsSchema
);

export default PlatformSettings;