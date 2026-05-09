import logger from "../utils/logger.js";
import {
  hasActiveAccess,
  PREMIUM_FEATURES,
} from "../services/subscriptionService.js";

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

const premiumAccess = (feature = PREMIUM_FEATURES.TIESHEET) => {
  return async (req, res, next) => {
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

      const access = await hasActiveAccess({
        userId,
        tournamentId,
        feature,
      });

      if (access.hasAccess) {
        req.premiumAccess = access;
        return next();
      }

      return res.status(402).json({
        success: false,
        paymentRequired: true,
        feature,
        reason: access.reason,
        message: "Premium access required",
      });
    } catch (error) {
      logger.error("Premium access verification failed", {
        error: error.message,
        stack: error.stack,
        userId,
        tournamentId,
        feature,
      });

      return res.status(500).json({
        success: false,
        message: "Failed to verify premium access",
      });
    }
  };
};

export { PREMIUM_FEATURES };
export default premiumAccess;