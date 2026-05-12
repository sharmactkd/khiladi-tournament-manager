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
  getPendingTeamSubmissionCount
);

router.get(
  "/:tournamentId",
  authMiddleware,
  getTournamentTeamSubmissions
);

router.patch(
  "/:submissionId/approve",
  authMiddleware,
  requireCsrfToken,
  sensitiveRateLimiter,
  approveTeamSubmission
);

router.patch(
  "/:submissionId/reject",
  authMiddleware,
  requireCsrfToken,
  sensitiveRateLimiter,
  rejectTeamSubmission
);

export default router;