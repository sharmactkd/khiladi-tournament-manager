import dotenv from "dotenv";
import mongoose from "mongoose";

import User from "../models/user.js";
import Payment from "../models/payment.js";
import Coupon from "../models/coupon.js";
import AccessEntitlement from "../models/accessEntitlement.js";
import { createAccessEntitlement } from "../services/accessEntitlementService.js";

dotenv.config();

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI missing");
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connected");
};

const entitlementExists = async ({ source, sourceId, userId, planType }) => {
  return AccessEntitlement.exists({
    source,
    sourceId,
    userId,
    planType,
    status: "active",
  });
};

const migratePaidPayments = async () => {
  const payments = await Payment.find({
    status: "paid",
    accessStartsAt: { $ne: null },
  }).lean();

  let created = 0;
  let skipped = 0;

  for (const payment of payments) {
    const exists = await entitlementExists({
      source: "payment",
      sourceId: payment._id,
      userId: payment.userId,
      planType: payment.planType,
    });

    if (exists) {
      skipped += 1;
      continue;
    }

    await createAccessEntitlement({
      userId: payment.userId,
      scope:
        payment.accessType === "tournament" || payment.planType === "single"
          ? "tournament"
          : "global",
      tournamentId:
        payment.accessType === "tournament" || payment.planType === "single"
          ? payment.tournamentId
          : null,
      source: "payment",
      sourceId: payment._id,
      planType: payment.planType,
      accessType:
        payment.planType === "lifetime"
          ? "lifetime"
          : payment.accessType === "tournament" || payment.planType === "single"
            ? "tournament"
            : "unlimited",
      startsAt: payment.accessStartsAt,
      expiresAt: payment.accessExpiresAt,
      metadata: {
        migrated: true,
        gateway: payment.gateway,
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: payment.razorpayPaymentId,
        planSnapshot: payment.planSnapshot,
      },
    });

    created += 1;
  }

  console.log("Paid payments migrated:", { created, skipped });
};

const migrateUserLegacyAccess = async () => {
  const now = new Date();

  const users = await User.find({
    isDeleted: { $ne: true },
    $or: [
      { lifetimeAccess: true },
      { adminAccessOverride: true },
      { trialExpiresAt: { $gt: now } },
      {
        subscriptionStatus: "active",
        premiumExpiresAt: { $gt: now },
        accessSource: { $in: ["admin", "coupon", "trial", "lifetime"] },
      },
    ],
  }).lean();

  let created = 0;
  let skipped = 0;

  for (const user of users) {
    if (user.lifetimeAccess) {
      const exists = await AccessEntitlement.exists({
        userId: user._id,
        source: "lifetime",
        status: "active",
      });

      if (!exists) {
        await createAccessEntitlement({
          userId: user._id,
          scope: "global",
          source: "lifetime",
          sourceId: user._id,
          planType: "lifetime",
          accessType: "lifetime",
          startsAt: user.createdAt || now,
          expiresAt: null,
          metadata: {
            migrated: true,
            fromUserLegacyField: true,
          },
        });
        created += 1;
      } else {
        skipped += 1;
      }
    }

    if (user.adminAccessOverride) {
      const exists = await AccessEntitlement.exists({
        userId: user._id,
        source: "admin",
        planType: "admin_override",
        status: "active",
      });

      if (!exists) {
        await createAccessEntitlement({
          userId: user._id,
          scope: "global",
          source: "admin",
          sourceId: user._id,
          planType: "admin_override",
          accessType: "admin",
          startsAt: user.updatedAt || now,
          expiresAt: user.premiumExpiresAt || null,
          metadata: {
            migrated: true,
            fromUserLegacyField: true,
          },
        });
        created += 1;
      } else {
        skipped += 1;
      }
    }

    if (user.trialExpiresAt && user.trialExpiresAt > now) {
      const exists = await AccessEntitlement.exists({
        userId: user._id,
        source: "trial",
        status: "active",
      });

      if (!exists) {
        await createAccessEntitlement({
          userId: user._id,
          scope: "global",
          source: "trial",
          sourceId: user._id,
          planType: "trial",
          accessType: "trial",
          startsAt: user.createdAt || now,
          expiresAt: user.trialExpiresAt,
          metadata: {
            migrated: true,
            fromUserLegacyField: true,
          },
        });
        created += 1;
      } else {
        skipped += 1;
      }
    }

    if (
      user.accessSource === "coupon" &&
      user.subscriptionStatus === "active" &&
      user.premiumExpiresAt &&
      user.premiumExpiresAt > now
    ) {
      const exists = await AccessEntitlement.exists({
        userId: user._id,
        source: "coupon",
        status: "active",
      });

      if (!exists) {
        await createAccessEntitlement({
          userId: user._id,
          scope: "global",
          source: "coupon",
          sourceId: user._id,
          planType: user.subscriptionType || "coupon",
          accessType: "coupon",
          startsAt: user.lastPaymentDate || user.updatedAt || now,
          expiresAt: user.premiumExpiresAt,
          metadata: {
            migrated: true,
            fromUserLegacyField: true,
          },
        });
        created += 1;
      } else {
        skipped += 1;
      }
    }
  }

  console.log("Legacy user access migrated:", { created, skipped });
};

const migrateCouponUsedBy = async () => {
  const coupons = await Coupon.find({
    active: true,
    deletedAt: null,
    type: "full_access",
    usedBy: { $exists: true, $ne: [] },
  }).lean();

  let created = 0;
  let skipped = 0;

  for (const coupon of coupons) {
    for (const usage of coupon.usedBy || []) {
      if (!usage.userId) continue;

      const exists = await AccessEntitlement.exists({
        userId: usage.userId,
        source: "coupon",
        sourceId: coupon._id,
        status: "active",
      });

      if (exists) {
        skipped += 1;
        continue;
      }

      await createAccessEntitlement({
        userId: usage.userId,
        scope: "global",
        source: "coupon",
        sourceId: coupon._id,
        planType: usage.planType || "coupon",
        accessType: "coupon",
        startsAt: usage.usedAt || coupon.updatedAt || new Date(),
        expiresAt: coupon.expiresAt || null,
        metadata: {
          migrated: true,
          couponCode: coupon.code,
          couponCategory: coupon.category,
          couponType: coupon.type,
          couponValue: coupon.value,
        },
      });

      created += 1;
    }
  }

  console.log("Coupon usedBy migrated:", { created, skipped });
};

const run = async () => {
  try {
    await connectDB();

    await migratePaidPayments();
    await migrateUserLegacyAccess();
    await migrateCouponUsedBy();

    console.log("Access entitlement migration completed");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
};

run();