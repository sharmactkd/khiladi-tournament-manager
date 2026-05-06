import mongoose from "mongoose";
import logger from "../utils/logger.js";
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
  let userId;
  let tournamentId;

  try {
    userId = getUserId(req);
    tournamentId = getTournamentId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    const now = new Date();

    const unlimitedAccess = await Payment.findOne({
      userId,
      status: "paid",
      accessType: "unlimited",
      accessStartsAt: { $ne: null },
      accessExpiresAt: { $gt: now },
    }).sort({ accessExpiresAt: -1 });

    if (unlimitedAccess) {
      req.premiumAccess = {
        hasAccess: true,
        accessType: "unlimited",
        planType: unlimitedAccess.planType,
        paymentId: unlimitedAccess._id,
        accessStartsAt: unlimitedAccess.accessStartsAt,
        accessExpiresAt: unlimitedAccess.accessExpiresAt,
      };

      return next();
    }

    if (tournamentId && mongoose.Types.ObjectId.isValid(tournamentId)) {
      const tournamentAccess = await Payment.findOne({
        userId,
        tournamentId,
        status: "paid",
        accessType: "tournament",
      }).sort({ createdAt: -1 });

      if (tournamentAccess) {
        req.premiumAccess = {
          hasAccess: true,
          accessType: "tournament",
          planType: tournamentAccess.planType,
          paymentId: tournamentAccess._id,
          tournamentId,
          accessStartsAt: tournamentAccess.accessStartsAt,
          accessExpiresAt: tournamentAccess.accessExpiresAt,
        };

        return next();
      }
    }

    return res.status(402).json({
      success: false,
      paymentRequired: true,
      message: "Premium access required",
    });
  } catch (error) {
    logger.error("Premium access verification failed", {
      error: error.message,
      stack: error.stack,
      userId,
      tournamentId,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to verify premium access",
    });
  }
};

export default premiumAccess;