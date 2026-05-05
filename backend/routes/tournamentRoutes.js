import express from "express";
import multer from "multer";

import {
  createTournament,
  getAllTournaments,
  getOngoingTournaments,
  getPreviousTournaments,
  getTournamentById,
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
import optionalAuthMiddleware from "../middleware/optionalAuthMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js"; // Default import
import { upload } from "../middleware/upload.js";
import mongoose from "mongoose";
import Tournament from "../models/tournament.js";
import logger from "../utils/logger.js";

const router = express.Router();

// Multer Error Handler (Add kar do — silent crash fix)
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

// ================ MIDDLEWARE: Tournament Ownership Check ================
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
      stack: error.stack // Stack add for better debug
    });
    return res.status(500).json({ message: "Server error during authorization" });
  }
};

// ================ PUBLIC ROUTES (No Auth Required) ================
router.get("/", getAllTournaments);
router.get("/ongoing", getOngoingTournaments);
router.get("/previous", getPreviousTournaments);

// My Tournaments - Logged in user के अपने tournaments
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

    res.status(200).json({ count: normalized.length, data: normalized });
  } catch (error) {
    logger.error("Get my tournaments failed", { 
      error: error.message, 
      userId: req.user?._id 
    });
    res.status(500).json({ message: "Failed to load your tournaments" });
  }
});

// Public view with visibility check
router.get("/:id", optionalAuthMiddleware, async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid tournament ID" });
  }

  try {
    const tournament = await Tournament.findById(id).select("+visibility"); // visibility field include
    if (!tournament) {
      return res.status(404).json({ message: "Tournament not found" });
    }

    // If private and not logged in or not owner, hide
    if (tournament.visibility === false && (!req.user || tournament.createdBy.toString() !== req.user._id.toString())) {
      return res.status(403).json({ message: "This tournament is private" });
    }

    // Call original controller
    getTournamentById(req, res, next);
  } catch (error) {
    logger.error("Public tournament view error", { tournamentId: id, error: error.message, stack: error.stack });
    res.status(500).json({ message: "Server error" });
  }
});

// ================ PROTECTED ROUTES (Auth + Ownership Required) ================
router.post(
  "/",
  authMiddleware,
  upload.fields([
    { name: "poster", maxCount: 1 },
    { name: "logos", maxCount: 2 },
  ]),
  multerErrorHandler, // Add kar do — silent crash fix
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
  multerErrorHandler, // Add kar do — silent crash fix
  updateTournament
);

// Outcomes
router.get("/:id/outcomes", authMiddleware, requireOwnership, getOutcomes);
router.put("/:id/outcomes", authMiddleware, requireOwnership, saveOutcomes);

// Tie Sheet
router.get("/:id/tiesheet", authMiddleware, requireOwnership, getTieSheet);
router.put("/:id/tiesheet", authMiddleware, requireOwnership, saveTieSheet);

// ✅ NEW: lightweight outcomes update
router.patch("/:id/tiesheet/outcomes", authMiddleware, requireOwnership, saveTieSheetOutcomes);
router.get("/:id/tiesheet-outcomes", authMiddleware, requireOwnership, getTieSheetOutcomes);
router.put("/:id/tiesheet-outcomes", authMiddleware, requireOwnership, saveTieSheetOutcomes);

// Officials
router.get("/:id/officials", authMiddleware, requireOwnership, getOfficials);
router.put("/:id/officials", authMiddleware, requireOwnership, saveOfficials);

// Team Payments
router.get("/:id/team-payments", authMiddleware, requireOwnership, getTeamPayments);
router.put("/:id/team-payments", authMiddleware, requireOwnership, saveTeamPayments);

// TieSheet Record
router.post("/:id/tiesheet-record", authMiddleware, requireOwnership, saveTieSheetRecord);

export default router;