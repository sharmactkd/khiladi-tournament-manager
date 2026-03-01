import {
  MAIN_AGE_CATEGORIES,
  KYORUGI_SUB_EVENTS,
  POOMSAE_SUB_EVENTS,
} from "./constants";

/**
 * Core handler: Toggle age category (new style - values + setFieldValue)
 */
const handleAgeToggleCore = (values, setFieldValue, age, type) => {
  const currentAges = values.ageCategories[type] || [];
  const isSelected = currentAges.includes(age);

  const newAges = isSelected ? currentAges.filter((a) => a !== age) : [...currentAges, age];

  const newGender = { ...values.ageGender[type] };
  if (isSelected) {
    delete newGender[age];
  } else {
    newGender[age] = ["Male", "Female"];
  }

  setFieldValue(`ageCategories.${type}`, newAges);
  setFieldValue(`ageGender.${type}`, newGender);
};

/**
 * Core handler: Toggle gender
 */
const handleGenderToggleCore = (values, setFieldValue, age, gender, type) => {
  const current = values.ageGender?.[type]?.[age] || [];
  const newGenders = current.includes(gender)
    ? current.filter((g) => g !== gender)
    : [...current, gender];

  setFieldValue(`ageGender.${type}.${age}`, newGenders);
};

/**
 * Core handler: Select all ages
 */
const handleSelectAllAgesCore = (values, setFieldValue, type) => {
  const currentAges = values.ageCategories[type] || [];
  const allSelected = MAIN_AGE_CATEGORIES.every((age) => currentAges.includes(age));

  let newAges;
  let newGender = { ...values.ageGender[type] };

  if (allSelected) {
    newAges = currentAges.filter((age) => !MAIN_AGE_CATEGORIES.includes(age));
    MAIN_AGE_CATEGORIES.forEach((age) => delete newGender[age]);
  } else {
    const agesToAdd = MAIN_AGE_CATEGORIES.filter((age) => !currentAges.includes(age));
    newAges = [...currentAges, ...agesToAdd];
    agesToAdd.forEach((age) => {
      newGender[age] = ["Male", "Female"];
    });
  }

  setFieldValue(`ageCategories.${type}`, newAges);
  setFieldValue(`ageGender.${type}`, newGender);
};

// ====================== EXPORTED HANDLERS ======================

export const handleKyorugiSubEventToggle = (values, setFieldValue, subKey) => {
  const currentSub = values.eventCategories.kyorugi.sub || {};
  const newSubValue = !currentSub[subKey];

  const newSub = { ...currentSub, [subKey]: newSubValue };
  const newAmounts = { ...values.entryFees.amounts.kyorugi };

  if (newSubValue) {
    newAmounts[subKey] = { type: "Free", amount: undefined };
  } else {
    delete newAmounts[subKey];
  }

  setFieldValue("eventCategories.kyorugi.sub", newSub);
  setFieldValue("eventCategories.kyorugi.selected", Object.values(newSub).some((v) => v));
  setFieldValue("entryFees.amounts.kyorugi", newAmounts);
};

export const handlePoomsaeCategoryToggle = (values, setFieldValue, category) => {
  const currentCats = values.eventCategories.poomsae.categories || [];
  const isSelected = currentCats.includes(category);
  const newCategories = isSelected
    ? currentCats.filter((c) => c !== category)
    : [...currentCats, category];

  const newAmounts = { ...values.entryFees.amounts.poomsae };
  if (!isSelected) {
    newAmounts[category] = { type: "Free", amount: undefined };
  } else {
    delete newAmounts[category];
  }

  setFieldValue("eventCategories.poomsae.categories", newCategories);
  setFieldValue("eventCategories.poomsae.selected", newCategories.length > 0);
  setFieldValue("entryFees.amounts.poomsae", newAmounts);
};

export const handleAgeToggle = (values, setFieldValue, age, type) => {
  handleAgeToggleCore(values, setFieldValue, age, type);
};

export const handleGenderToggle = (values, setFieldValue, age, gender, type) => {
  handleGenderToggleCore(values, setFieldValue, age, gender, type);
};

export const handleSelectAllAges = (values, setFieldValue, type) => {
  handleSelectAllAgesCore(values, setFieldValue, type);
};

export const handleAgeChange = (setFieldValue, e, age, type) => {
  e?.preventDefault();
  console.warn("handleAgeChange (old) is deprecated. Use handleAgeToggle instead.");
};

export const handleAgeGenderChange = (setFieldValue, e, age, gender, type) => {
  e?.preventDefault();
  console.warn("handleAgeGenderChange (old) is deprecated. Use handleGenderToggle instead.");
};

// ====================== OTHER HELPERS ======================

export const updateTournamentTypes = (ageCategories) => {
  const types = [];
  if (Array.isArray(ageCategories.open) && ageCategories.open.length > 0) {
    types.push("Open");
  }
  if (Array.isArray(ageCategories.official) && ageCategories.official.length > 0) {
    types.push("Official");
  }
  return types;
};

export const validateFile = (file, maxSizeMB = 8) => {
  if (!file) return { valid: true, error: null };

  const maxSize = maxSizeMB * 1024 * 1024;
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (file.size > maxSize) {
    return { valid: false, error: `${file.name} file size must be under ${maxSizeMB}MB` };
  }
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: `${file.name} must be JPG, PNG, or WebP` };
  }

  return { valid: true, error: null };
};

export const getFullImageUrl = (url) => {
  if (!url) return "/default-poster.jpg";

  if (typeof url === "string") {
    let clean = url.trim();

    // Fix broken protocol: https:/ → https://  and http:/ → http://
    clean = clean.replace(/^https?:\/(?!\/)/g, (match) => match + "/");
    clean = clean.replace(/^http?:\/(?!\/)/g, (match) => match + "/");

    if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;

    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
    const uploadsBase = String(baseUrl).replace(/\/api\/?$/, "");
    return `${uploadsBase}/uploads/${clean.replace(/^\/+/, "")}`;
  }

  if (url instanceof File) return URL.createObjectURL(url);

  return "/default-poster.jpg";
};

export const getFileNameFromPath = (pathOrFile) => {
  if (!pathOrFile) return "";
  if (typeof pathOrFile === "string") return pathOrFile.split(/[\\/]/).pop();
  if (pathOrFile instanceof File) return pathOrFile.name;
  return "";
};

export const handleSelectAllKyorugi = (values, setFieldValue) => {
  const currentSub = values.eventCategories.kyorugi.sub || {};
  const allSelected = Object.values(currentSub).every((v) => v);

  const newSub = {};
  const newAmounts = {};

  KYORUGI_SUB_EVENTS.forEach((sub) => {
    newSub[sub.key] = !allSelected;
    if (!allSelected) {
      newAmounts[sub.key] = { type: "Free", amount: undefined };
    }
  });

  setFieldValue("eventCategories.kyorugi.sub", newSub);
  setFieldValue("eventCategories.kyorugi.selected", !allSelected);
  setFieldValue("entryFees.amounts.kyorugi", newAmounts);
};

export const handleSelectAllPoomsae = (values, setFieldValue) => {
  const current = values.eventCategories.poomsae.categories || [];
  const allSelected = POOMSAE_SUB_EVENTS.every((cat) => current.includes(cat));

  const newCategories = allSelected ? [] : [...POOMSAE_SUB_EVENTS];
  const newAmounts = {};

  if (!allSelected) {
    POOMSAE_SUB_EVENTS.forEach((cat) => {
      newAmounts[cat] = { type: "Free", amount: undefined };
    });
  }

  setFieldValue("eventCategories.poomsae.categories", newCategories);
  setFieldValue("eventCategories.poomsae.selected", newCategories.length > 0);
  setFieldValue("entryFees.amounts.poomsae", newAmounts);
};