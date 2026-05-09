import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  createPaymentOrder,
  verifyPayment,
  getMyAccessStatus,
} from "../controllers/paymentController.js";
import { sensitiveRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.post("/create-order", authMiddleware, sensitiveRateLimiter, createPaymentOrder);
router.post("/verify", authMiddleware, sensitiveRateLimiter,verifyPayment);
router.get("/access-status", authMiddleware, getMyAccessStatus);

export default router;