// backend/middleware/premiumAccess.js
import mongoose from "mongoose";
import Payment from "../models/payment.js";

const getUserId = (req) => {
  return req.user?._id || req.user?.id || req.user?.userId;
};

const getTournamentId = (req) => {
  return (
    req.params?.id ||
    req.params?.tournamentId ||
    req.body?.tournamentId ||
    req.query?.tournamentId ||
    null
  );
};

const premiumAccess = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const tournamentId = getTournamentId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    const now = new Date();

    // ✅ Check unlimited plan
    const unlimitedAccess = await Payment.findOne({
      userId,
      status: "paid",
      accessType: "unlimited",
      accessStartsAt: { $ne: null },
      accessExpiresAt: { $gt: now },
    });

    if (unlimitedAccess) {
      req.premiumAccess = {
        hasAccess: true,
        accessType: "unlimited",
        planType: unlimitedAccess.planType,
      };

      return next();
    }

    // ✅ Check single tournament plan
    if (tournamentId && mongoose.Types.ObjectId.isValid(tournamentId)) {
      const tournamentAccess = await Payment.findOne({
        userId,
        tournamentId,
        status: "paid",
        accessType: "tournament",
      });

      if (tournamentAccess) {
        req.premiumAccess = {
          hasAccess: true,
          accessType: "tournament",
          planType: tournamentAccess.planType,
          tournamentId,
        };

        return next();
      }
    }

    // ❌ No access
    return res.status(402).json({
      success: false,
      paymentRequired: true,
      message: "Premium access required",
    });
  } catch (error) {
    console.error("premiumAccess error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to verify premium access",
    });
  }
};

export default premiumAccess;