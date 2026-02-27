// backend/routes/entryRoutes.js

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { getEntries, saveEntries } from "../controllers/entryController.js";
import Tournament from "../models/tournament.js";
import mongoose from "mongoose";
import logger from "../utils/logger.js";

const router = express.Router();

// backend/routes/entryRoutes.js में validateTournamentOwnership function update करें:
const validateTournamentOwnership = async (req, res, next) => {
  const tournamentId = req.params.id?.trim();
  
  console.log('=== validateTournamentOwnership ===');
  console.log('Tournament ID:', tournamentId);
  console.log('User ID:', req.user?._id);
  
  if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
    console.log('Invalid ObjectId format');
    return res.status(400).json({ message: "Invalid tournament ID format" });
  }

  if (!req.user) {
    console.log('No user found');
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const tournament = await Tournament.findById(tournamentId).select("createdBy");
    
    console.log('Tournament found:', !!tournament);
    console.log('Tournament owner:', tournament?.createdBy?.toString());
    console.log('Requesting user:', req.user._id.toString());
    
    if (!tournament) {
      console.log('Tournament not found in DB');
      return res.status(404).json({ message: "Tournament not found" });
    }

    const isOwner = tournament.createdBy.toString() === req.user._id.toString();
    console.log('Is owner?', isOwner);
    
    if (!isOwner) {
      console.log('User is not owner');
      return res.status(403).json({ message: "You are not the organizer of this tournament" });
    }

    req.tournament = tournament;
    next();
  } catch (error) {
    console.error('Error in ownership validation:', error);
    return res.status(500).json({ message: "Server error during validation" });
  }
};

router.get("/:id/entries", authMiddleware, validateTournamentOwnership, getEntries);
router.post("/:id/entries", authMiddleware, validateTournamentOwnership, saveEntries);

export default router;