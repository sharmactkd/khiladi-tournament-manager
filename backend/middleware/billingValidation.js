import mongoose from "mongoose";
import { body, param, query, validationResult } from "express-validator";

const couponCategories = [
  "discount_coupon",
  "trial_coupon",
  "free_tournament_coupon",
  "academy_coupon",
  "full_access_coupon",
];

export const handleBillingValidation = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array().map((error) => ({
        field: error.path,
        message: error.msg,
      })),
    });
  }

  next();
};

export const validatePlatformSettingsUpdate = [
  body("paymentsEnabled").optional().isBoolean(),
  body("maintenanceFreeAccess").optional().isBoolean(),
  body("registrationEnabled").optional().isBoolean(),
  body("couponSystemEnabled").optional().isBoolean(),
  body("trialEnabled").optional().isBoolean(),
  body("defaultCurrency").optional().isString().trim().isLength({ min: 3, max: 5 }),
  body("defaultTrialDays").optional().isInt({ min: 1, max: 365 }),
  body("defaultMonthlyPrice").optional().isFloat({ min: 0 }),
  body("defaultYearlyPrice").optional().isFloat({ min: 0 }),
  body("defaultLifetimePrice").optional().isFloat({ min: 0 }),
  body("plans.monthly.enabled").optional().isBoolean(),
  body("plans.monthly.price").optional().isFloat({ min: 0 }),
  body("plans.monthly.durationDays").optional().isInt({ min: 1, max: 3660 }),
  body("plans.yearly.enabled").optional().isBoolean(),
  body("plans.yearly.price").optional().isFloat({ min: 0 }),
  body("plans.yearly.durationDays").optional().isInt({ min: 1, max: 3660 }),
  body("plans.lifetime.enabled").optional().isBoolean(),
  body("plans.lifetime.price").optional().isFloat({ min: 0 }),
  handleBillingValidation,
];

export const validateCouponCreate = [
  body("code").isString().trim().isLength({ min: 3, max: 40 }),
  body("type").isIn(["percentage", "fixed", "full_access"]),
  body("category").optional().isIn(couponCategories),
  body("value").optional().isFloat({ min: 0 }),
  body("active").optional().isBoolean(),
  body("maxUses").optional({ nullable: true }).isInt({ min: 1 }),
  body("expiresAt").optional({ nullable: true }).isISO8601(),
  body("applicablePlans").optional().isArray(),
  body("allowedUsers").optional().isArray(),
  handleBillingValidation,
];

export const validateCouponUpdate = [
  param("couponId").isMongoId(),
  body("code").optional().isString().trim().isLength({ min: 3, max: 40 }),
  body("type").optional().isIn(["percentage", "fixed", "full_access"]),
  body("category").optional().isIn(couponCategories),
  body("value").optional().isFloat({ min: 0 }),
  body("active").optional().isBoolean(),
  body("maxUses").optional({ nullable: true }).isInt({ min: 1 }),
  body("expiresAt").optional({ nullable: true }).isISO8601(),
  body("applicablePlans").optional().isArray(),
  body("allowedUsers").optional().isArray(),
  handleBillingValidation,
];

export const validateCouponParam = [
  param("couponId").isMongoId(),
  handleBillingValidation,
];

export const validateCouponValidate = [
  body("code").isString().trim().isLength({ min: 3, max: 40 }),
  body("planType").optional().isString().trim(),
  handleBillingValidation,
];

export const validateAccessAction = (req, res, next) => {
  const { userId } = req.params;
  const {
    reason = "",
    confirmationText = "",
    planType = "",
    days = "",
  } = req.body || {};

  if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
    return res.status(400).json({
      success: false,
      message: "Valid userId is required",
    });
  }

  const path = String(req.originalUrl || req.path || "").toLowerCase();

  const requiredConfirmations = [
    {
      match: "/grant-premium",
      text: "GRANT_PREMIUM",
      action: "grant premium access",
    },
    {
      match: "/remove-premium",
      text: "REMOVE_PREMIUM",
      action: "remove premium access",
    },
    {
      match: "/extend-premium",
      text: "EXTEND_PREMIUM",
      action: "extend premium access",
    },
    {
      match: "/lifetime",
      text: "ENABLE_LIFETIME",
      action: "enable lifetime access",
    },
    {
      match: "/start-trial",
      text: "START_TRIAL",
      action: "start trial",
    },
    {
      match: "/remove-trial",
      text: "REMOVE_TRIAL",
      action: "remove trial",
    },
    {
      match: "/enable-override",
      text: "ENABLE_OVERRIDE",
      action: "enable admin override",
    },
    {
      match: "/disable-override",
      text: "DISABLE_OVERRIDE",
      action: "disable admin override",
    },
    {
      match: "/block",
      text: "BLOCK_USER",
      action: "block user",
    },
    {
      match: "/unblock",
      text: "UNBLOCK_USER",
      action: "unblock user",
    },
    {
      match: "/force-logout",
      text: "FORCE_LOGOUT",
      action: "force logout user",
    },
    {
      match: "/coupons/apply",
      text: "APPLY_COUPON",
      action: "apply coupon for user",
    },
  ];

  const requirement = requiredConfirmations.find((item) =>
    path.includes(item.match)
  );

  if (requirement) {
    if (!String(reason || "").trim() || String(reason).trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: `Reason is required to ${requirement.action}`,
      });
    }

    if (String(confirmationText || "").trim() !== requirement.text) {
      return res.status(400).json({
        success: false,
        message: `Invalid confirmationText. Type ${requirement.text} to ${requirement.action}.`,
        requiredConfirmationText: requirement.text,
      });
    }
  }

  if (planType && typeof planType !== "string") {
    return res.status(400).json({
      success: false,
      message: "planType must be a string",
    });
  }

  if (days !== "" && days !== undefined && days !== null) {
    const safeDays = Number(days);

    if (!Number.isFinite(safeDays) || safeDays <= 0 || safeDays > 3650) {
      return res.status(400).json({
        success: false,
        message: "days must be a positive number up to 3650",
      });
    }

    req.body.days = safeDays;
  }

  req.body.reason = String(reason || "").trim();
  req.body.confirmationText = String(confirmationText || "").trim();

  next();
};

export const validateBillingUserQuery = [
  query("search").optional().isString().trim(),
  query("filter").optional().isString().trim(),
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 100 }),
  handleBillingValidation,
];