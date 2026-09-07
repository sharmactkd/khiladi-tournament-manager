import express from "express";
import multer from "multer";

import {
  createTournament,
  getAllTournaments,
  getOngoingTournaments,
  getPreviousTournaments,
  getTournamentHome,
  getTournamentById,
  getPrivateTournamentById,
  updateTournament,
  getOutcomes,
  saveOutcomes,
  getTieSheet,
  saveTieSheet,
  getTieSheetOutcomes,
  saveTieSheetOutcomes,
  getOfficials,
  saveOfficials,
  getTeamPayments,
  saveTeamPayments,
  saveTieSheetRecord,
  getWinnerAggregation,
  getTeamChampionshipAggregation,
} from "../controllers/tournamentController.js";

import { requireCsrfToken } from "../middleware/csrfProtection.js";
import {
  sensitiveRateLimiter,
  tieSheetOutcomeRateLimiter,
} from "../middleware/rateLimiter.js";
import optionalAuthMiddleware from "../middleware/optionalAuthMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { upload } from "../middleware/upload.js";
import Tournament from "../models/tournament.js";
import logger from "../utils/logger.js";
import {
  requireTournamentOwner,
  requireTournamentPremiumPage,
  requireTournamentMutation,
} from "../middleware/tournamentAccessMiddleware.js";

const router = express.Router();

const multerErrorHandler = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    logger.error("Multer error", { code: err.code, field: err.field });
    return res.status(400).json({ message: err.message });
  }

  if (err) {
    logger.error("File upload error", { error: err.message });
    return res.status(400).json({ message: err.message });
  }

  next();
};

// ================ PUBLIC ROUTES ================
router.get("/", getAllTournaments);
router.get("/home", getTournamentHome);
router.get("/ongoing", getOngoingTournaments);
router.get("/previous", getPreviousTournaments);

// ================ MY TOURNAMENTS ================
router.get("/my", authMiddleware, async (req, res) => {
  try {
    const tournaments = await Tournament.find({ createdBy: req.user._id })
      .sort({ createdAt: -1 })
      .populate("createdBy", "name email")
      .lean();

    const normalized = tournaments.map((t) => ({
      ...t,
      poster: t.poster || null,
      logos: t.logos || [],
    }));

    return res.status(200).json({
      count: normalized.length,
      data: normalized,
    });
  } catch (error) {
    logger.error("Get my tournaments failed", {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id,
    });

    return res.status(500).json({ message: "Failed to load your tournaments" });
  }
});

// ================ PUBLIC TOURNAMENT VIEW WITH OPTIONAL AUTH ================
router.get("/:id", optionalAuthMiddleware, getTournamentById);

router.get(
  "/:id/private",
  authMiddleware,
  requireTournamentOwner(),
  getPrivateTournamentById
);

// ================ CREATE / UPDATE TOURNAMENT ================
router.post(
  "/",
  authMiddleware,
  requireCsrfToken,
  sensitiveRateLimiter,
  upload.fields([
    { name: "poster", maxCount: 1 },
    { name: "logos", maxCount: 2 },
  ]),
  multerErrorHandler,
  createTournament
);

router.put(
  "/:id",
  authMiddleware,
  requireTournamentMutation("basicCorrection"),
  requireCsrfToken,
  sensitiveRateLimiter,
  upload.fields([
    { name: "poster", maxCount: 1 },
    { name: "logos", maxCount: 2 },
  ]),
  multerErrorHandler,
  updateTournament
);

// ================ RESULT / OUTCOME ROUTES ================
router.get(
  "/:id/outcomes",
  authMiddleware,
  requireTournamentPremiumPage({ feature: "winner" }),
  getOutcomes
);

router.put(
  "/:id/outcomes",
  authMiddleware,
  requireTournamentMutation("result", { feature: "winner" }),
  requireCsrfToken,
  sensitiveRateLimiter,
  saveOutcomes
);

router.get(
  "/:id/winners",
  authMiddleware,
  requireTournamentPremiumPage({ feature: "winner" }),
  getWinnerAggregation
);

router.get(
  "/:id/team-championship",
  authMiddleware,
  requireTournamentPremiumPage({ feature: "team_championship" }),
  getTeamChampionshipAggregation
);

// ================ TIE SHEET ================
router.get(
  "/:id/tiesheet",
  authMiddleware,
  requireTournamentPremiumPage({ feature: "tiesheet" }),
  getTieSheet
);

router.put(
  "/:id/tiesheet",
  authMiddleware,
  requireTournamentMutation("tiesheet", { feature: "tiesheet" }),
  requireCsrfToken,
  saveTieSheet
);

router.patch(
  "/:id/tiesheet/outcomes",
  authMiddleware,
  requireTournamentMutation("tiesheet", { feature: "tiesheet" }),
  requireCsrfToken,
  tieSheetOutcomeRateLimiter,
  saveTieSheetOutcomes
);

router.get(
  "/:id/tiesheet-outcomes",
  authMiddleware,
  requireTournamentPremiumPage({ feature: "tiesheet" }),
  getTieSheetOutcomes
);

router.put(
  "/:id/tiesheet-outcomes",
  authMiddleware,
  requireTournamentMutation("tiesheet", { feature: "tiesheet" }),
  requireCsrfToken,
  tieSheetOutcomeRateLimiter,
  saveTieSheetOutcomes
);

// ================ OFFICIALS ================
router.get(
  "/:id/officials",
  authMiddleware,
  requireTournamentPremiumPage({ feature: "officials" }),
  getOfficials
);

router.put(
  "/:id/officials",
  authMiddleware,
  requireTournamentMutation("official", { feature: "officials" }),
  requireCsrfToken,
  sensitiveRateLimiter,
  saveOfficials
);

// ================ TEAM PAYMENTS ================
router.get(
  "/:id/team-payments",
  authMiddleware,
  requireTournamentPremiumPage({ feature: "team_payments" }),
  getTeamPayments
);

router.put(
  "/:id/team-payments",
  authMiddleware,
  requireTournamentMutation("payment", { feature: "team_payments" }),
  requireCsrfToken,
  sensitiveRateLimiter,
  saveTeamPayments
);

// ================ TIE SHEET RECORD ================
router.post(
  "/:id/tiesheet-record",
  authMiddleware,
  requireTournamentMutation("tiesheet", { feature: "tiesheet_record" }),
  requireCsrfToken,
  sensitiveRateLimiter,
  saveTieSheetRecord
);

export default router;
