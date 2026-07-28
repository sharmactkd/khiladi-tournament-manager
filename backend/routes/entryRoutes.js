// backend/routes/entryRoutes.js

import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  getEntries,
  saveEntries,
  createSingleEntry,
  updateSingleEntry,
  deleteSingleEntry,
  createBulkEntries,
  bulkSyncEntries,
} from "../controllers/entryController.js";
import { requireCsrfToken } from "../middleware/csrfProtection.js";
import {
  entrySaveRateLimiter,
  sensitiveRateLimiter,
} from "../middleware/rateLimiter.js";
import {
  requireTournamentOwner,
  requireTournamentMutation,
} from "../middleware/tournamentAccessMiddleware.js";

const router = express.Router();

router.get(
  "/:id/entries",
  authMiddleware,
  requireTournamentOwner(),
  getEntries
);

router.patch(
  "/:id/entries/bulk-sync",
  authMiddleware,
  requireTournamentMutation("entry"),
  requireCsrfToken,
  entrySaveRateLimiter,
  bulkSyncEntries
);

router.post(
  "/:id/entries",
  authMiddleware,
  requireTournamentMutation("entry"),
  requireCsrfToken,
  sensitiveRateLimiter,
  saveEntries
);

router.post(
  "/:id/entries/row",
  authMiddleware,
  requireTournamentMutation("entry"),
  requireCsrfToken,
  sensitiveRateLimiter,
  createSingleEntry
);

router.patch(
  "/:id/entries/:entryId",
  authMiddleware,
  requireTournamentMutation("entry"),
  requireCsrfToken,
  sensitiveRateLimiter,
  updateSingleEntry
);

router.delete(
  "/:id/entries/:entryId",
  authMiddleware,
  requireTournamentMutation("destructive"),
  requireCsrfToken,
  sensitiveRateLimiter,
  deleteSingleEntry
);

router.post(
  "/:id/entries/bulk",
  authMiddleware,
  requireTournamentMutation("import"),
  requireCsrfToken,
  sensitiveRateLimiter,
  createBulkEntries
);

export default router;
