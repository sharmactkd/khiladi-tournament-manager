// src/components/TournamentForm/validationSchema.js

import * as Yup from "yup";

// Helpers (kept local + deterministic)
const isNonEmptyString = (v) => typeof v === "string" && v.trim() !== "";

const toNumberOrNull = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

// Validates a single custom row:
// - min must be present and >= 0
// - max can be blank (open-ended). If provided, must be > min
// - if max blank: ok (your UI uses this for "Over" category)
const isValidCustomRow = (row) => {
  if (!row || typeof row !== "object") return false;

  const min = toNumberOrNull(row.min);
  const max = toNumberOrNull(row.max);

  if (min === null || min < 0) return false;

  // Open-ended category: max blank is allowed
  if (max === null) return true;

  // If max is provided, it must be strictly greater than min
  return max > min;
};

// Detect new format vs old format and check at least one division exists
const hasAtLeastOneDivision = (custom) => {
  if (!custom || typeof custom !== "object") return false;

  return Object.values(custom).some((ageGroupVal) => {
    if (!ageGroupVal) return false;

    // NEW FORMAT: { Male: [...], Female: [...] }
    if (typeof ageGroupVal === "object" && !Array.isArray(ageGroupVal)) {
      const maleArr = Array.isArray(ageGroupVal.Male) ? ageGroupVal.Male : [];
      const femaleArr = Array.isArray(ageGroupVal.Female) ? ageGroupVal.Female : [];
      return maleArr.length > 0 || femaleArr.length > 0;
    }

    // OLD FORMAT: [...]
    if (Array.isArray(ageGroupVal)) {
      return ageGroupVal.length > 0;
    }

    return false;
  });
};

// Validate rows for both new + old custom formats
const allRowsAreValid = (custom) => {
  if (!custom || typeof custom !== "object") return true;

  for (const ageGroupVal of Object.values(custom)) {
    if (!ageGroupVal) continue;

    // NEW FORMAT: { Male: [...], Female: [...] }
    if (typeof ageGroupVal === "object" && !Array.isArray(ageGroupVal)) {
      const maleArr = Array.isArray(ageGroupVal.Male) ? ageGroupVal.Male : [];
      const femaleArr = Array.isArray(ageGroupVal.Female) ? ageGroupVal.Female : [];

      for (const row of maleArr) {
        if (!isValidCustomRow(row)) return false;
      }
      for (const row of femaleArr) {
        if (!isValidCustomRow(row)) return false;
      }
      continue;
    }

    // OLD FORMAT: [...]
    if (Array.isArray(ageGroupVal)) {
      for (const row of ageGroupVal) {
        if (!isValidCustomRow(row)) return false;
      }
      continue;
    }

    // Unknown structure
    return false;
  }

  return true;
};

const validationSchema = Yup.object({
  // Basic Info - Mandatory
  organizer: Yup.string().trim().required("Organizer name is required"),
  federation: Yup.string().trim().required("Federation name is required"),
  tournamentName: Yup.string().trim().required("Tournament name is required"),
  email: Yup.string().email("Invalid email format").required("Email is required"),
  contact: Yup.string().required("Contact number is required"),

  // Dates - Mandatory with conditional past date rule
  dateFrom: Yup.date()
    .required("Start date is required")
    .test("start-date-validation", "Start date cannot be in the past", function (value) {
      const { _id } = this.parent;
      if (_id && String(_id).trim() !== "") return true; // Edit mode → allow past dates

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (!value) return false;

      const normalized = new Date(value);
      normalized.setHours(0, 0, 0, 0);

      return normalized >= today;
    }),

  dateTo: Yup.date()
    .required("End date is required")
    .test("date-to-validation", "End date must be same day or after start date", function (value) {
      const { dateFrom } = this.parent;
      if (!dateFrom || !value) return true;

      const start = new Date(dateFrom);
      start.setHours(0, 0, 0, 0);

      const end = new Date(value);
      end.setHours(0, 0, 0, 0);

      return end >= start;
    }),

  // Venue - Mandatory
  venue: Yup.object().shape({
    name: Yup.string().trim().required("Venue name is required"),
    country: Yup.string().required("Country is required"),
    state: Yup.string().required("State is required"),
    district: Yup.string().required("District is required"),
  }),

  // Age Categories - At least one required
  ageCategories: Yup.object({
    open: Yup.array().of(Yup.string()),
    official: Yup.array().of(Yup.string()),
  }).test("at-least-one-age-category", "At least one age category must be selected", function (value) {
    if (!value) return false;
    const openCount = Array.isArray(value.open) ? value.open.length : 0;
    const officialCount = Array.isArray(value.official) ? value.official.length : 0;
    return openCount > 0 || officialCount > 0;
  }),

  // Event Categories
  eventCategories: Yup.object({
    kyorugi: Yup.object({
      selected: Yup.boolean(),
      sub: Yup.object().when("selected", {
        is: true,
        then: (schema) =>
          schema.test("at-least-one-kyorugi-sub", "At least one Kyorugi sub-event is required", function (sub) {
            if (!sub) return false;
            return Object.values(sub).some((v) => v === true);
          }),
        otherwise: (schema) => schema.nullable(),
      }),
    }),
    poomsae: Yup.object({
      selected: Yup.boolean(),
      categories: Yup.array().when("selected", {
        is: true,
        then: (schema) => schema.min(1, "At least one Poomsae category is required"),
        otherwise: (schema) => schema.nullable(),
      }),
    }),
  }).test("at-least-one-event", "At least one event (Kyorugi or Poomsae) is required", function (value) {
    if (!value) return false;
    return value.kyorugi?.selected === true || value.poomsae?.selected === true;
  }),

  // ====== WEIGHT CATEGORIES – SUPPORTS NEW AGE+GENDER CUSTOM STRUCTURE + OLD FORMAT ======
  weightCategories: Yup.object({
    type: Yup.string().oneOf(["WT", "SGFI", "custom"]).required(),

    custom: Yup.mixed().when("type", {
      is: "custom",
      then: (schema) =>
        schema
          .test("has-data", "At least one age group must have divisions", (value) => {
            return hasAtLeastOneDivision(value);
          })
          .test("valid-rows", "Invalid weight divisions", (value) => {
            return allRowsAreValid(value);
          }),
      otherwise: (schema) => schema.strip(),
    }),

    selected: Yup.object().nullable(),
  }),

  // Optional fields
  medalPoints: Yup.object({
    gold: Yup.number().min(0, "Must be 0 or more"),
    silver: Yup.number().min(0, "Must be 0 or more"),
    bronze: Yup.number().min(0, "Must be 0 or more"),
  }).nullable(),

  poster: Yup.mixed().nullable(),

  logos: Yup.array().of(Yup.mixed().nullable()).nullable(),
});

export default validationSchema;