import mongoose from "mongoose";

export const ENTITLEMENT_STATUSES = ["active", "expired", "revoked"];

export const ENTITLEMENT_SOURCES = [
  "payment",
  "coupon",
  "admin",
  "trial",
  "lifetime",
  "global",
  "migration",
  "system",
];

const accessEntitlementSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    scope: {
      type: String,
      enum: ["global", "tournament", "feature"],
      required: true,
      index: true,
    },

    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      default: null,
      index: true,
    },

    feature: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    source: {
      type: String,
      enum: ENTITLEMENT_SOURCES,
      required: true,
      index: true,
    },

    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    planType: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    accessType: {
      type: String,
      enum: [
        "global",
        "unlimited",
        "tournament",
        "feature",
        "trial",
        "admin",
        "lifetime",
        "coupon",
      ],
      required: true,
      index: true,
    },

    startsAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: ENTITLEMENT_STATUSES,
      default: "active",
      index: true,
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    revokeReason: {
      type: String,
      default: "",
      trim: true,
    },

    priority: {
      type: Number,
      default: 100,
      index: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

accessEntitlementSchema.index({
  userId: 1,
  status: 1,
  scope: 1,
  startsAt: 1,
  expiresAt: 1,
});

accessEntitlementSchema.index({
  userId: 1,
  tournamentId: 1,
  status: 1,
});


accessEntitlementSchema.index({
  userId: 1,
  feature: 1,
  status: 1,
});

/**
 * Prevent duplicate active entitlement for same paid payment.
 * This protects against webhook retry + frontend verify race.
 */
accessEntitlementSchema.index(
  {
    source: 1,
    sourceId: 1,
    status: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      source: "payment",
      status: "active",
    },
  }
);

/**
 * Prevent duplicate active coupon entitlement for same user + coupon.
 */
accessEntitlementSchema.index(
  {
    userId: 1,
    source: 1,
    sourceId: 1,
    status: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      source: "coupon",
      status: "active",
    },
  }
);

const AccessEntitlement = mongoose.model(
  "AccessEntitlement",
  accessEntitlementSchema
);

export default AccessEntitlement;