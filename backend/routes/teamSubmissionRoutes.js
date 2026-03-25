import express from "express";
import authMiddleware, { authorizeRoles } from "../middleware/authMiddleware.js";
import {
  submitTeamSubmission,
  getTournamentTeamSubmissions,
  approveTeamSubmission,
  rejectTeamSubmission,
  getPendingTeamSubmissionCount,
} from "../controllers/teamSubmissionController.js";

const router = express.Router();

router.post(
  "/:tournamentId/submit",
  authMiddleware,
  authorizeRoles("organizer", "coach", "player"),
  submitTeamSubmission
);

router.get(
  "/:tournamentId",
  authMiddleware,
  authorizeRoles("organizer"),
  getTournamentTeamSubmissions
);

router.get(
  "/:tournamentId/pending-count",
  authMiddleware,
  authorizeRoles("organizer"),
  getPendingTeamSubmissionCount
);

router.patch(
  "/:submissionId/approve",
  authMiddleware,
  authorizeRoles("organizer"),
  approveTeamSubmission
);

router.patch(
  "/:submissionId/reject",
  authMiddleware,
  authorizeRoles("organizer"),
  rejectTeamSubmission
);

export default router;