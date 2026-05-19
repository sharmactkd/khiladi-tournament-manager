// backend/routes/paymentRoutes.js
import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  createPaymentOrder,
  verifyPayment,
  getMyAccessStatus,
  getPaymentStatus,
  listAvailableCouponsForUser,
  validateCoupon,
  applyCoupon,
} from "../controllers/paymentController.js";
import { requireCsrfToken } from "../middleware/csrfProtection.js";
import { sensitiveRateLimiter } from "../middleware/rateLimiter.js";
import { validateCouponValidate } from "../middleware/billingValidation.js";

const router = express.Router();

router.post(
  "/create-order",
  authMiddleware,
  requireCsrfToken,
  sensitiveRateLimiter,
  createPaymentOrder
);

router.post(
  "/verify",
  authMiddleware,
  requireCsrfToken,
  sensitiveRateLimiter,
  verifyPayment
);

router.get("/access-status", authMiddleware, getMyAccessStatus);
router.get("/status", authMiddleware, getPaymentStatus);

router.get(
  "/coupons/available",
  authMiddleware,
  listAvailableCouponsForUser
);

router.post(
  "/coupon/validate",
  authMiddleware,
  sensitiveRateLimiter,
  validateCouponValidate,
  validateCoupon
);

router.post(
  "/coupon/apply",
  authMiddleware,
  requireCsrfToken,
  sensitiveRateLimiter,
  validateCouponValidate,
  applyCoupon
);

export default router;