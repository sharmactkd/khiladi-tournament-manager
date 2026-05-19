// backend/middleware/billingValidation.js
import mongoose from "mongoose";
import { body, param, query, validationResult } from "express-validator";

const couponCategories = [
  "discount_coupon",
  "trial_coupon",
  "free_tournament_coupon",
  "academy_coupon",
  "full_access_coupon",
];

const couponTypes = ["percentage", "fixed", "full_access"];

const couponPlanTypes = [
  "single",
  "six_months",
  "one_year",
  "monthly",
  "yearly",
  "lifetime",
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

const optionalNullableInt = (field) =>
  body(field)
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage(`${field} must be a number greater than 0`);

const optionalNullableIsoDate = (field) =>
  body(field)
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601()
    .withMessage(`${field} must be a valid date`);

const validateApplicablePlans = body("applicablePlans")
  .optional()
  .isArray()
  .withMessage("applicablePlans must be an array")
  .custom((plans = []) => {
    const invalidPlan = plans.find(
      (plan) => !couponPlanTypes.includes(String(plan || "").trim())
    );

    if (invalidPlan) {
      throw new Error(`Invalid applicable plan: ${invalidPlan}`);
    }

    return true;
  });

const validateAllowedUsers = body("allowedUsers")
  .optional()
  .isArray()
  .withMessage("allowedUsers must be an array")
  .custom((users = []) => {
    const invalidUser = users.find(
      (userId) => !mongoose.Types.ObjectId.isValid(String(userId))
    );

    if (invalidUser) {
      throw new Error(`Invalid allowed user id: ${invalidUser}`);
    }

    return true;
  });

export const validatePlatformSettingsUpdate = [
  body("paymentsEnabled").optional().isBoolean(),
  body("maintenanceFreeAccess").optional().isBoolean(),
  body("registrationEnabled").optional().isBoolean(),
  body("couponSystemEnabled").optional().isBoolean(),
  body("trialEnabled").optional().isBoolean(),
  body("defaultCurrency")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 3, max: 5 }),
  body("defaultTrialDays").optional().isInt({ min: 1, max: 365 }),
  body("defaultMonthlyPrice").optional().isFloat({ min: 0 }),
  body("defaultYearlyPrice").optional().isFloat({ min: 0 }),
  body("defaultLifetimePrice").optional().isFloat({ min: 0 }),

  body("plans.single.enabled").optional().isBoolean(),
  body("plans.single.price").optional().isFloat({ min: 0 }),
  body("plans.single.durationDays").optional({ nullable: true }).isInt({ min: 1, max: 3660 }),
  body("plans.single.currency").optional().isString().trim().isLength({ min: 3, max: 5 }),
  body("plans.single.accessType").optional().isIn(["tournament", "unlimited"]),

  body("plans.six_months.enabled").optional().isBoolean(),
  body("plans.six_months.price").optional().isFloat({ min: 0 }),
  body("plans.six_months.durationDays").optional({ nullable: true }).isInt({ min: 1, max: 3660 }),
  body("plans.six_months.currency").optional().isString().trim().isLength({ min: 3, max: 5 }),
  body("plans.six_months.accessType").optional().isIn(["tournament", "unlimited"]),

  body("plans.one_year.enabled").optional().isBoolean(),
  body("plans.one_year.price").optional().isFloat({ min: 0 }),
  body("plans.one_year.durationDays").optional({ nullable: true }).isInt({ min: 1, max: 3660 }),
  body("plans.one_year.currency").optional().isString().trim().isLength({ min: 3, max: 5 }),
  body("plans.one_year.accessType").optional().isIn(["tournament", "unlimited"]),

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
  body("code")
    .isString()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage("Coupon code must be 3-50 characters"),
  body("type").isIn(couponTypes).withMessage("Invalid coupon type"),
  body("category").optional().isIn(couponCategories).withMessage("Invalid coupon category"),
  body("value").optional().isFloat({ min: 0 }).withMessage("Coupon value cannot be negative"),
  body("active").optional().isBoolean(),
  optionalNullableInt("maxUses"),
  optionalNullableIsoDate("expiresAt"),
  validateApplicablePlans,
  validateAllowedUsers,
  body("singleUsePerUser").optional().isBoolean(),
  body().custom((payload) => {
    const type = String(payload.type || "").trim();
    const value = Number(payload.value || 0);

    if (type === "percentage" && value > 100) {
      throw new Error("Percentage coupon value cannot be more than 100");
    }

    return true;
  }),
  handleBillingValidation,
];

export const validateCouponUpdate = [
  param("couponId").isMongoId(),
  body("code")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage("Coupon code must be 3-50 characters"),
  body("type").optional().isIn(couponTypes).withMessage("Invalid coupon type"),
  body("category").optional().isIn(couponCategories).withMessage("Invalid coupon category"),
  body("value").optional().isFloat({ min: 0 }).withMessage("Coupon value cannot be negative"),
  body("active").optional().isBoolean(),
  optionalNullableInt("maxUses"),
  optionalNullableIsoDate("expiresAt"),
  validateApplicablePlans,
  validateAllowedUsers,
  body("singleUsePerUser").optional().isBoolean(),
  body().custom((payload) => {
    const type = String(payload.type || "").trim();
    const value = Number(payload.value || 0);

    if (type === "percentage" && value > 100) {
      throw new Error("Percentage coupon value cannot be more than 100");
    }

    return true;
  }),
  handleBillingValidation,
];

export const validateCouponParam = [
  param("couponId").isMongoId(),
  handleBillingValidation,
];

export const validateCouponValidate = [
  body("code")
    .isString()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage("Coupon code must be 3-50 characters"),
  body("planType")
    .optional()
    .isString()
    .trim()
    .custom((planType) => {
      if (!planType) return true;

      if (!couponPlanTypes.includes(String(planType).trim())) {
        throw new Error("Invalid planType");
      }

      return true;
    }),
  body("tournamentId")
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId()
    .withMessage("Invalid tournamentId"),
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

  if (
    planType &&
    ![
      "single",
      "six_months",
      "one_year",
      "monthly",
      "yearly",
      "lifetime",
      "admin_override",
      "trial",
    ].includes(String(planType).trim())
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid planType",
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