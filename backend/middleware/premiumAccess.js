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

const isLocalPremiumBypassEnabled = () => {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.LOCAL_PREMIUM_BYPASS === "true"
  );
};

const buildDeniedResponse = ({ feature, access }) => ({
  success: false,
  paymentRequired: true,
  feature,
  reason: access?.reason || "premium-access-required",
  message: "Premium access required",
  access: {
    hasAccess: false,
    source: access?.source || null,
    accessType: access?.accessType || null,
    planType: access?.planType || null,
    expiresAt: access?.expiresAt || null,
    tournamentId: access?.tournamentId || null,
    entitlementId: access?.entitlementId || null,
  },
});

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

      if (isLocalPremiumBypassEnabled()) {
        req.premiumAccess = {
          hasAccess: true,
          accessType: "local-dev-bypass",
          planType: "local-dev",
          paymentId: null,
          tournamentId,
          accessStartsAt: new Date(),
          accessExpiresAt: null,
          feature,
          reason: "LOCAL_PREMIUM_BYPASS enabled",
          entitlementId: null,
        };

        return next();
      }

      const access = await hasActiveAccess({
        userId,
        tournamentId,
        feature,
      });

      if (!access?.hasAccess) {
        return res.status(402).json(buildDeniedResponse({ feature, access }));
      }

      req.premiumAccess = {
        ...access,
        feature,
        tournamentId,
      };

      return next();
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