import express from "express";
import authMiddleware, { authorizeRoles } from "../middleware/authMiddleware.js";
import {
  submitTeamSubmission,
  getTournamentTeamSubmissions,
  approveTeamSubmission,
  rejectTeamSubmission,
  getPendingTeamSubmissionCount,
} from "../controllers/teamSubmissionController.js";
import { requireCsrfToken } from "../middleware/csrfProtection.js";
import { sensitiveRateLimiter } from "../middleware/rateLimiter.js";
import { validateTeamSubmissionPayload } from "../middleware/teamSubmissionValidation.js";
import TeamEntrySubmission from "../models/TeamEntrySubmission.js";
import logger from "../utils/logger.js";
import {
  requireTournamentOwner,
  requireTournamentMutation,
} from "../middleware/tournamentAccessMiddleware.js";

const router = express.Router();

const attachTournamentIdFromSubmission = async (req, res, next) => {
  try {
    const { submissionId } = req.params;

    const submission = await TeamEntrySubmission.findById(submissionId)
      .select("tournamentId")
      .lean();

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    req.params.tournamentId = String(submission.tournamentId);
    return next();
  } catch (error) {
    logger.error("Failed to resolve submission tournament", {
      submissionId: req.params?.submissionId,
      userId: req.user?._id,
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      message: "Failed to validate submission access",
    });
  }
};

router.post(
  "/:tournamentId/submit",
  authMiddleware,
  authorizeRoles("organizer", "coach", "player"),
  requireCsrfToken,
  sensitiveRateLimiter,
  validateTeamSubmissionPayload,
  submitTeamSubmission
);

router.get(
  "/:tournamentId/pending-count",
  authMiddleware,
  requireTournamentOwner(),
  getPendingTeamSubmissionCount
);

router.get(
  "/:tournamentId",
  authMiddleware,
  requireTournamentOwner(),
  getTournamentTeamSubmissions
);

router.patch(
  "/:submissionId/approve",
  authMiddleware,
  attachTournamentIdFromSubmission,
  requireTournamentMutation("entry"),
  requireCsrfToken,
  sensitiveRateLimiter,
  approveTeamSubmission
);

router.patch(
  "/:submissionId/reject",
  authMiddleware,
  attachTournamentIdFromSubmission,
  requireTournamentMutation("entry"),
  requireCsrfToken,
  sensitiveRateLimiter,
  rejectTeamSubmission
);

export default router;