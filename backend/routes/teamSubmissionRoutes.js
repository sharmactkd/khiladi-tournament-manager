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

const router = express.Router();

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
  authorizeRoles("organizer", "admin", "superadmin"),
  getPendingTeamSubmissionCount
);

router.get(
  "/:tournamentId",
  authMiddleware,
  authorizeRoles("organizer"),
  requireCsrfToken,
  getTournamentTeamSubmissions
);

router.patch(
  "/:submissionId/approve",
  authMiddleware,
  authorizeRoles("organizer"),
  requireCsrfToken,
  sensitiveRateLimiter,
  approveTeamSubmission
);

router.patch(
  "/:submissionId/reject",
  authMiddleware,
  authorizeRoles("organizer"),
  requireCsrfToken,
  sensitiveRateLimiter,
  rejectTeamSubmission
);

export default router;