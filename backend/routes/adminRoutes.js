import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware, { superAdminMiddleware } from "../middleware/adminMiddleware.js";
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

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get("/dashboard", getAdminDashboard);
router.get("/users", getAdminUsers);
router.get("/users/:userId", getAdminUserDetails);

router.patch("/users/:userId/suspend", superAdminMiddleware, suspendAdminUser);
router.patch("/users/:userId/unsuspend", superAdminMiddleware, unsuspendAdminUser);
router.delete("/users/:userId", superAdminMiddleware, deleteAdminUser);

router.get("/tournaments", getAdminTournaments);
router.get("/tournaments/:tournamentId", getAdminTournamentDetails);
router.delete("/tournaments/:tournamentId", superAdminMiddleware, deleteAdminTournament);

router.get("/payments", getAdminPayments);
router.get("/entries", getAdminEntries);

export default router;