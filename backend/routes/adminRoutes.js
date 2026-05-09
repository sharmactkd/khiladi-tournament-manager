import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware, {
  superAdminMiddleware,
  requireAdminPermission,
} from "../middleware/adminMiddleware.js";
import {
  getAdminDashboard,
  getAdminUsers,
  getAdminUserDetails,
  getAdminTournaments,
  getAdminTournamentDetails,
  getAdminPayments,
  getAdminEntries,
  suspendAdminUser,
  unsuspendAdminUser,
  deleteAdminUser,
  deleteAdminTournament,
} from "../controllers/adminController.js";
import { requireCsrfToken } from "../middleware/csrfProtection.js";

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get(
  "/dashboard",
  requireAdminPermission("dashboard:read"),
  getAdminDashboard,
);

router.get("/users", requireAdminPermission("users:read"), getAdminUsers);
router.get(
  "/users/:userId",
  requireAdminPermission("users:read"),
  getAdminUserDetails,
);

router.patch(
  "/users/:userId/suspend",
  requireCsrfToken,
  requireAdminPermission("users:manage"),
  superAdminMiddleware,
  suspendAdminUser,
);
router.patch(
  "/users/:userId/unsuspend",
  requireCsrfToken,
  requireAdminPermission("users:manage"),
  superAdminMiddleware,
  unsuspendAdminUser
);
router.delete(
  "/users/:userId",
  requireCsrfToken,
  requireAdminPermission("users:manage"),
  superAdminMiddleware,
  deleteAdminUser
);
router.get(
  "/tournaments",
  requireAdminPermission("tournaments:read"),
  getAdminTournaments,
);
router.get(
  "/tournaments/:tournamentId",
  requireAdminPermission("tournaments:read"),
  getAdminTournamentDetails,
);
router.delete(
  "/tournaments/:tournamentId",
  requireCsrfToken,
  requireAdminPermission("tournaments:manage"),
  superAdminMiddleware,
  deleteAdminTournament
);

router.get(
  "/payments",
  requireAdminPermission("payments:read"),
  getAdminPayments,
);
router.get("/entries", requireAdminPermission("entries:read"), getAdminEntries);

export default router;
