// backend/middleware/tournamentAccessMiddleware.js

import logger from "../utils/logger.js";
import {
  getTournamentAccessById,
  canMutateTournament,
} from "../services/tournamentAccessService.js";

const getTournamentIdFromReq = (req) =>
  req.params?.id ||
  req.params?.tournamentId ||
  req.body?.tournamentId ||
  req.query?.tournamentId ||
  null;

const sendAccessDenied = (res, status, message, extra = {}) =>
  res.status(status).json({
    success: false,
    message,
    ...extra,
  });

const attachTournamentAccess = async (req, res, next, options = {}) => {
  const tournamentId = getTournamentIdFromReq(req);

  try {
    const { tournament, access } = await getTournamentAccessById({
      tournamentId,
      user: req.user || null,
      feature: options.feature || "",
      select: options.select || "",
    });

    req.tournament = tournament;
    req.tournamentAccess = access;

    return next();
  } catch (error) {
    logger.error("Tournament access middleware failed", {
      tournamentId,
      userId: req.user?._id || req.user?.id,
      error: error.message,
      stack: error.stack,
    });

    return sendAccessDenied(
      res,
      error.statusCode || 500,
      error.statusCode ? error.message : "Server error during tournament access check"
    );
  }
};

export const requireTournamentView = (options = {}) => {
  return async (req, res, next) => {
    await attachTournamentAccess(req, res, () => {
      if (!req.tournamentAccess?.canView) {
        return sendAccessDenied(res, 403, "Access denied: Tournament is private");
      }

      return next();
    }, options);
  };
};

export const requireTournamentOwner = (options = {}) => {
  return async (req, res, next) => {
    await attachTournamentAccess(req, res, () => {
      if (!req.tournamentAccess?.isOwner) {
        return sendAccessDenied(
          res,
          403,
          "Access denied: You are not the organizer of this tournament"
        );
      }

      return next();
    }, options);
  };
};

export const requireTournamentPremiumPage = (options = {}) => {
  return async (req, res, next) => {
    await attachTournamentAccess(req, res, () => {
      if (!req.tournamentAccess?.isOwner) {
        return sendAccessDenied(
          res,
          403,
          "Access denied: You do not have access to this tournament"
        );
      }

      if (!req.tournamentAccess?.canAccessPremiumPages) {
        return sendAccessDenied(res, 402, "Premium access required", {
          paymentRequired: true,
          access: req.tournamentAccess,
        });
      }

      return next();
    }, options);
  };
};

export const requireTournamentMutation = (mode, options = {}) => {
  return async (req, res, next) => {
    await attachTournamentAccess(req, res, () => {
      const result = canMutateTournament({
        access: req.tournamentAccess,
        mode,
      });

      if (!result.allowed) {
        const status = result.reason === "premium-access-required" ? 402 : 403;

        return sendAccessDenied(res, status, "Tournament mutation not allowed", {
          reason: result.reason,
          mode,
          access: req.tournamentAccess,
          paymentRequired: status === 402,
        });
      }

      return next();
    }, options);
  };
};

export default {
  requireTournamentView,
  requireTournamentOwner,
  requireTournamentPremiumPage,
  requireTournamentMutation,
};