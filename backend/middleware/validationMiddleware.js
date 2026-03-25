import { body, validationResult } from "express-validator";

// Helper to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: "Validation failed",
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

// ==================== USER REGISTRATION VALIDATION ====================
export const validateRegister = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be between 2 and 50 characters"),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/\d/)
    .withMessage("Password must contain at least one number")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password must be at least one lowercase letter")
    .matches(/[!@#$%^&*]/)
    .withMessage("Password must contain at least one special character (!@#$%^&*)"),

  body("role")
    .trim()
    .notEmpty()
    .withMessage("Role is required")
    .isIn(["organizer", "coach", "player"])
    .withMessage("Role must be organizer, coach, or player"),

  handleValidationErrors,
];

// ==================== LOGIN VALIDATION ====================
export const validateLogin = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email or mobile number is required")
    .custom((value) => {
      const v = String(value).trim();
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      const isPhone = /^\d{10,15}$/.test(v.replace(/\s+/g, ""));
      if (!isEmail && !isPhone) {
        throw new Error("Enter a valid email or mobile number");
      }
      return true;
    }),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long"),

  handleValidationErrors,
];

// ==================== TOURNAMENT CREATION / UPDATE VALIDATION ====================
export const validateTournament = [
  body("organizer")
    .trim()
    .notEmpty()
    .withMessage("Organizer name is required"),

  body("federation")
    .trim()
    .notEmpty()
    .withMessage("Federation name is required"),

  body("tournamentName")
    .trim()
    .notEmpty()
    .withMessage("Tournament name is required")
    .isLength({ max: 100 })
    .withMessage("Tournament name is too long"),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Contact email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  body("contact")
    .trim()
    .notEmpty()
    .withMessage("Contact phone number is required")
    .custom((value) => {
      const parsed = parsePhoneNumberFromString(value);
      if (!parsed || !parsed.isValid()) throw new Error("Invalid phone number format");
      return true;
    }),

  body("dateFrom")
    .notEmpty()
    .withMessage("Start date is required")
    .isISO8601()
    .withMessage("Start date must be in YYYY-MM-DD format"),

  body("dateTo")
    .notEmpty()
    .withMessage("End date is required")
    .isISO8601()
    .withMessage("End date must be in YYYY-MM-DD format")
    .custom((value, { req }) => {
      const start = new Date(req.body.dateFrom);
      const end = new Date(value);
      if (end <= start) throw new Error("End date must be after start date");
      return true;
    }),

  body("tournamentLevel")
    .optional()
    .isIn(["Inter School", "District", "State", "National", "International"])
    .withMessage("Invalid tournament level selected"),

  body("visibility")
    .optional()
    .isBoolean()
    .withMessage("Visibility must be true or false"),

  body("playerLimit")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Player limit must be a positive number"),

  handleValidationErrors,
];