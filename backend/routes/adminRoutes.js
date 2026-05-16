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
import {
  getBillingDashboard,
  getPlatformSettings,
  updatePlatformSettings,
  getBillingUsers,
  grantPremium,
  removePremium,
  extendPremium,
  setLifetimeAccess,
  startTrial,
  removeTrial,
  enableOverride,
  disableOverride,
  blockUser,
  unblockUser,
  forceLogoutUser,
  listCoupons,
  createCoupon,
  updateCoupon,
  disableCoupon,
  deleteCoupon,
  validateCoupon,
  applyCouponForUserByAdmin,
  listTransactions,
  listAuditLogs,
  reconcileBillingPayments,
reconcileBillingPaymentById,
cleanupStaleBillingPayments,
listInvoices,
} from "../controllers/billingController.js";
import { requireCsrfToken } from "../middleware/csrfProtection.js";
import {
  validatePlatformSettingsUpdate,
  validateCouponCreate,
  validateCouponUpdate,
  validateCouponParam,
  validateCouponValidate,
  validateAccessAction,
  validateBillingUserQuery,
} from "../middleware/billingValidation.js";

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get(
  "/dashboard",
  requireAdminPermission("dashboard:read"),
  getAdminDashboard
);

router.get(
  "/users",
  requireAdminPermission("users:read_basic"),
  getAdminUsers
);

router.get(
  "/users/:userId",
  requireAdminPermission("users:read_basic"),
  getAdminUserDetails
);

router.patch(
  "/users/:userId/suspend",
  requireCsrfToken,
  requireAdminPermission("users:manage"),
  superAdminMiddleware,
  suspendAdminUser
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
  getAdminTournaments
);

router.get(
  "/tournaments/:tournamentId",
  requireAdminPermission("tournaments:read"),
  getAdminTournamentDetails
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
  getAdminPayments
);

router.get("/entries", requireAdminPermission("entries:read"), getAdminEntries);

/**
 * SaaS Billing Admin Routes
 */
router.get(
  "/billing/dashboard",
  requireAdminPermission("billing:read"),
  getBillingDashboard
);

router.get(
  "/billing/settings",
  requireAdminPermission("billing:read"),
  getPlatformSettings
);

router.patch(
  "/billing/settings",
  requireCsrfToken,
  requireAdminPermission("billing:manage"),
  superAdminMiddleware,
  validatePlatformSettingsUpdate,
  updatePlatformSettings
);

router.get(
  "/billing/users",
  requireAdminPermission("billing:read"),
  validateBillingUserQuery,
  getBillingUsers
);

router.patch(
  "/billing/users/:userId/grant-premium",
  requireCsrfToken,
  requireAdminPermission("billing:manage"),
  superAdminMiddleware,
  validateAccessAction,
  grantPremium
);

router.patch(
  "/billing/users/:userId/remove-premium",
  requireCsrfToken,
  requireAdminPermission("billing:manage"),
  superAdminMiddleware,
  validateAccessAction,
  removePremium
);

router.patch(
  "/billing/users/:userId/extend-premium",
  requireCsrfToken,
  requireAdminPermission("billing:manage"),
  superAdminMiddleware,
  validateAccessAction,
  extendPremium
);

router.patch(
  "/billing/users/:userId/lifetime",
  requireCsrfToken,
  requireAdminPermission("billing:manage"),
  superAdminMiddleware,
  validateAccessAction,
  setLifetimeAccess
);

router.patch(
  "/billing/users/:userId/start-trial",
  requireCsrfToken,
  requireAdminPermission("billing:manage"),
  superAdminMiddleware,
  validateAccessAction,
  startTrial
);

router.patch(
  "/billing/users/:userId/remove-trial",
  requireCsrfToken,
  requireAdminPermission("billing:manage"),
  superAdminMiddleware,
  validateAccessAction,
  removeTrial
);

router.patch(
  "/billing/users/:userId/enable-override",
  requireCsrfToken,
  requireAdminPermission("billing:manage"),
  superAdminMiddleware,
  validateAccessAction,
  enableOverride
);

router.patch(
  "/billing/users/:userId/disable-override",
  requireCsrfToken,
  requireAdminPermission("billing:manage"),
  superAdminMiddleware,
  validateAccessAction,
  disableOverride
);

router.patch(
  "/billing/users/:userId/block",
  requireCsrfToken,
  requireAdminPermission("billing:manage"),
  superAdminMiddleware,
  validateAccessAction,
  blockUser
);

router.patch(
  "/billing/users/:userId/unblock",
  requireCsrfToken,
  requireAdminPermission("billing:manage"),
  superAdminMiddleware,
  validateAccessAction,
  unblockUser
);

router.patch(
  "/billing/users/:userId/force-logout",
  requireCsrfToken,
  requireAdminPermission("billing:manage"),
  superAdminMiddleware,
  validateAccessAction,
  forceLogoutUser
);

router.get(
  "/billing/coupons",
  requireAdminPermission("coupons:read"),
  listCoupons
);

router.post(
  "/billing/coupons",
  requireCsrfToken,
  requireAdminPermission("coupons:manage"),
  superAdminMiddleware,
  validateCouponCreate,
  createCoupon
);

router.patch(
  "/billing/coupons/:couponId",
  requireCsrfToken,
  requireAdminPermission("coupons:manage"),
  superAdminMiddleware,
  validateCouponUpdate,
  updateCoupon
);

router.patch(
  "/billing/coupons/:couponId/disable",
  requireCsrfToken,
  requireAdminPermission("coupons:manage"),
  superAdminMiddleware,
  validateCouponParam,
  disableCoupon
);

router.delete(
  "/billing/coupons/:couponId",
  requireCsrfToken,
  requireAdminPermission("coupons:manage"),
  superAdminMiddleware,
  validateCouponParam,
  deleteCoupon
);

router.post(
  "/billing/coupons/validate",
  requireAdminPermission("coupons:read"),
  validateCouponValidate,
  validateCoupon
);

router.post(
  "/billing/users/:userId/coupons/apply",
  requireCsrfToken,
  requireAdminPermission("coupons:manage"),
  superAdminMiddleware,
  validateAccessAction,
  validateCouponValidate,
  applyCouponForUserByAdmin
);

router.get(
  "/billing/transactions",
  requireAdminPermission("payments:read"),
  listTransactions
);

router.get(
  "/billing/audit-logs",
  requireAdminPermission("audit:read"),
  listAuditLogs
);

router.post(
  "/billing/reconcile-payments",
  requireCsrfToken,
  requireAdminPermission("payments:manage"),
  superAdminMiddleware,
  reconcileBillingPayments
);

router.post(
  "/billing/reconcile-payments/:paymentId",
  requireCsrfToken,
  requireAdminPermission("payments:manage"),
  superAdminMiddleware,
  reconcileBillingPaymentById
);

router.post(
  "/billing/cleanup-stale-payments",
  requireCsrfToken,
  requireAdminPermission("payments:manage"),
  superAdminMiddleware,
  cleanupStaleBillingPayments
);

router.get(
  "/billing/invoices",
  requireAdminPermission("payments:read"),
  listInvoices
);

export default router;