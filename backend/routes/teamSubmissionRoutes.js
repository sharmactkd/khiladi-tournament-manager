import express from "express";
import authMiddleware, { authorizeRoles } from "../middleware/authMiddleware.js";
import {
  submitTeamSubmission,
  getTournamentTeamSubmissions,
  approveTeamSubmission,
  rejectTeamSubmission,
  getPendingTeamSubmissionCount,
} from "../controllers/teamSubmissionController.js";
import { sensitiveRateLimiter } from "../middleware/rateLimiter.js";  

const router = express.Router();

router.post(
  "/:tournamentId/submit",
  authMiddleware,
  authorizeRoles("organizer", "coach", "player"),
  sensitiveRateLimiter,
  submitTeamSubmission
);

router.get(
  "/:tournamentId/pending-count",
  authMiddleware,
  authorizeRoles("organizer", "admin", "superadmin"),
  getPendingTeamSubmissionCount
);

router.get(
  "/:tournamentId",
  authMiddleware,
  authorizeRoles("organizer"),
  getTournamentTeamSubmissions
);

router.patch(
  "/:submissionId/approve",
  authMiddleware,
  authorizeRoles("organizer"),
  sensitiveRateLimiter,
  approveTeamSubmission
);

router.patch(
  "/:submissionId/reject",
  authMiddleware,
  authorizeRoles("organizer"),
  sensitiveRateLimiter,
  rejectTeamSubmission
);

export default router;