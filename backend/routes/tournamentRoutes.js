import express from "express";
import multer from "multer";

import {
  createTournament,
  getAllTournaments,
  getOngoingTournaments,
  getPreviousTournaments,
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
} from "../controllers/tournamentController.js";

import premiumAccess from "../middleware/premiumAccess.js";
import optionalAuthMiddleware from "../middleware/optionalAuthMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { upload } from "../middleware/upload.js";
import mongoose from "mongoose";
import Tournament from "../models/tournament.js";
import logger from "../utils/logger.js";

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

const requireOwnership = async (req, res, next) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid tournament ID format" });
  }

  try {
    const tournament = await Tournament.findById(id).select("createdBy visibility");

    if (!tournament) {
      return res.status(404).json({ message: "Tournament not found" });
    }

    if (tournament.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: "Access denied: You are not the organizer of this tournament",
      });
    }

    req.tournament = tournament;
    next();
  } catch (error) {
    logger.error("Tournament ownership check failed", {
      tournamentId: id,
      userId: req.user?._id,
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({ message: "Server error during authorization" });
  }
};

// ================ PUBLIC ROUTES ================
router.get("/", getAllTournaments);
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
      poster: t.poster ? t.poster : null,
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
router.get("/:id", optionalAuthMiddleware, async (req, res, next) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid tournament ID" });
  }

  try {
    const tournament = await Tournament.findById(id).select("createdBy visibility");

    if (!tournament) {
      return res.status(404).json({ message: "Tournament not found" });
    }

    if (
      tournament.visibility === false &&
      (!req.user || tournament.createdBy.toString() !== req.user._id.toString())
    ) {
      return res.status(403).json({ message: "This tournament is private" });
    }

    return getTournamentById(req, res, next);
  } catch (error) {
    logger.error("Public tournament view error", {
      tournamentId: id,
      userId: req.user?._id,
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/:id/private", authMiddleware, requireOwnership, getPrivateTournamentById);

// ================ CREATE / UPDATE TOURNAMENT ================
router.post(
  "/",
  authMiddleware,
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
  requireOwnership,
  upload.fields([
    { name: "poster", maxCount: 1 },
    { name: "logos", maxCount: 2 },
  ]),
  multerErrorHandler,
  updateTournament
);

// ================ NON-PREMIUM PROTECTED ROUTES ================
router.get("/:id/outcomes", authMiddleware, requireOwnership, getOutcomes);
router.put("/:id/outcomes", authMiddleware, requireOwnership, saveOutcomes);

// ================ PREMIUM PROTECTED ROUTES ================

// Tie Sheet
router.get("/:id/tiesheet", authMiddleware, requireOwnership, premiumAccess, getTieSheet);
router.put("/:id/tiesheet", authMiddleware, requireOwnership, premiumAccess, saveTieSheet);

// Tie Sheet Outcomes
router.patch(
  "/:id/tiesheet/outcomes",
  authMiddleware,
  requireOwnership,
  premiumAccess,
  saveTieSheetOutcomes
);

router.get(
  "/:id/tiesheet-outcomes",
  authMiddleware,
  requireOwnership,
  premiumAccess,
  getTieSheetOutcomes
);

router.put(
  "/:id/tiesheet-outcomes",
  authMiddleware,
  requireOwnership,
  premiumAccess,
  saveTieSheetOutcomes
);

// Officials
router.get("/:id/officials", authMiddleware, requireOwnership, premiumAccess, getOfficials);
router.put("/:id/officials", authMiddleware, requireOwnership, premiumAccess, saveOfficials);

// Team Payments
router.get(
  "/:id/team-payments",
  authMiddleware,
  requireOwnership,
  premiumAccess,
  getTeamPayments
);

router.put(
  "/:id/team-payments",
  authMiddleware,
  requireOwnership,
  premiumAccess,
  saveTeamPayments
);

// TieSheet Record
router.post(
  "/:id/tiesheet-record",
  authMiddleware,
  requireOwnership,
  premiumAccess,
  saveTieSheetRecord
);

export default router;