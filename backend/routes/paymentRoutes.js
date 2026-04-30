// backend/routes/paymentRoutes.js
import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";

import {
  createPaymentOrder,
  verifyPayment,
  getMyAccessStatus,
} from "../controllers/paymentController.js";

const router = express.Router();

router.post("/create-order", authMiddleware, createPaymentOrder);
router.post("/verify", authMiddleware, verifyPayment);
router.get("/access-status", authMiddleware, getMyAccessStatus);

export default router;