import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  createPaymentOrder,
  verifyPayment,
  getMyAccessStatus,
  getPaymentStatus,
   listAvailableCouponsForUser,
} from "../controllers/paymentController.js";
import {
  validateCoupon,
  applyCoupon,
} from "../controllers/billingController.js";
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

router.get(
  "/coupons/available",
  authMiddleware,
  listAvailableCouponsForUser
);

export default router;