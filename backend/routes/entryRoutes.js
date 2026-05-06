// backend/routes/entryRoutes.js

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  getEntries,
  saveEntries,
  updateSingleEntry,
  deleteSingleEntry,
} from "../controllers/entryController.js";
import Tournament from "../models/tournament.js";
import mongoose from "mongoose";
import logger from "../utils/logger.js";

const router = express.Router();

const validateTournamentOwnership = async (req, res, next) => {
  const tournamentId = req.params.id?.trim();

  if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
    logger.warn("Invalid tournament ID format in entry route", {
      tournamentId,
      userId: req.user?._id,
    });

    return res.status(400).json({ message: "Invalid tournament ID format" });
  }

  if (!req.user) {
    logger.warn("Entry route accessed without authenticated user", {
      tournamentId,
    });

    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const tournament = await Tournament.findById(tournamentId).select("createdBy");

    if (!tournament) {
      logger.warn("Tournament not found during entry ownership validation", {
        tournamentId,
        userId: req.user._id,
      });

      return res.status(404).json({ message: "Tournament not found" });
    }

    const isOwner = tournament.createdBy.toString() === req.user._id.toString();

    if (!isOwner) {
      logger.warn("Entry access denied: user is not tournament owner", {
        tournamentId,
        ownerId: tournament.createdBy,
        userId: req.user._id,
      });

      return res.status(403).json({
        message: "You are not the organizer of this tournament",
      });
    }

    req.tournament = tournament;
    next();
  } catch (error) {
    logger.error("Entry tournament ownership validation failed", {
      tournamentId,
      userId: req.user?._id,
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({ message: "Server error during validation" });
  }
};

router.get("/:id/entries", authMiddleware, validateTournamentOwnership, getEntries);
router.post("/:id/entries", authMiddleware, validateTournamentOwnership, saveEntries);

// Row-level APIs
router.patch(
  "/:id/entries/:entryId",
  authMiddleware,
  validateTournamentOwnership,
  updateSingleEntry
);

router.delete(
  "/:id/entries/:entryId",
  authMiddleware,
  validateTournamentOwnership,
  deleteSingleEntry
);

export default router;