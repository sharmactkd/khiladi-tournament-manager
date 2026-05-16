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

export const validateAccessAction = [
  param("userId").isMongoId(),
  body("planType")
    .optional()
    .isIn(["single", "six_months", "one_year", "monthly", "yearly", "lifetime", "trial"]),
  body("days").optional().isInt({ min: 1, max: 3650 }),
  body("reason").optional().isString().trim().isLength({ max: 300 }),
  handleBillingValidation,
];

export const validateBillingUserQuery = [
  query("search").optional().isString().trim(),
  query("filter").optional().isString().trim(),
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 100 }),
  handleBillingValidation,
];