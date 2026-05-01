import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import {
  getAdminDashboard,
  getAdminUsers,
  getAdminUserDetails,
  getAdminTournaments,
  getAdminTournamentDetails,
  getAdminPayments,
  getAdminEntries,
} from "../controllers/adminController.js";

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get("/dashboard", getAdminDashboard);
router.get("/users", getAdminUsers);
router.get("/users/:userId", getAdminUserDetails);
router.get("/tournaments", getAdminTournaments);
router.get("/tournaments/:tournamentId", getAdminTournamentDetails);
router.get("/payments", getAdminPayments);
router.get("/entries", getAdminEntries);

export default router;