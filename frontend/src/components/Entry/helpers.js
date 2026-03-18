// src/components/Entry/helpers.js

import { WT_WEIGHTS, SGFI_WEIGHTS } from '../TournamentForm/constants';

/**
 * Converts Excel serial date to DD-MM-YYYY format
 * @param {number} serial - Excel serial date number
 * @returns {string} Formatted date string or empty string if invalid
 * @example
 * excelSerialToDate(44562) // → "01-01-2022"
 */
export const excelSerialToDate = (serial) => {
  if (!serial || isNaN(serial)) return '';

  const excelEpoch = new Date(1899, 11, 30); // Excel's epoch (handles leap year bug)
  const days = Math.floor(serial);
  const msPerDay = 24 * 60 * 60 * 1000;
  const date = new Date(excelEpoch.getTime() + days * msPerDay);

  if (isNaN(date.getTime())) return '';

  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
};

/**
 * Validates and formats date of birth in DD-MM-YYYY format
 * @param {string} dob - Date string in DD-MM-YYYY format
 * @returns {{ isValid: boolean, formatted: string, message?: string }}
 * @example
 * validateDOB("29-02-2000") // → { isValid: true, formatted: "29-02-2000" }
 */
export const validateDOB = (dob) => {
  if (!dob) return { isValid: false, message: 'Please enter a complete date (DD-MM-YYYY)' };

  const parts = dob.split('-');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return { isValid: false, message: 'Please enter a complete date (DD-MM-YYYY)' };
  }

  let [day, month, year] = parts.map(Number);

  // Handle two-digit years (e.g., 25 → 2025, 95 → 1995)
  if (year < 100) year += year < 50 ? 2000 : 1900;

  if (isNaN(day) || isNaN(month) || isNaN(year)) {
    return { isValid: false, message: 'Invalid date entered' };
  }

  if (month < 1 || month > 12) return { isValid: false, message: 'Invalid month entered' };

  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  const daysInMonth = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (day < 1 || day > daysInMonth[month - 1]) {
    return { isValid: false, message: 'Invalid day entered' };
  }

  if (year < 1900) return { isValid: false, message: 'Date of birth cannot be before 1900' };

  const currentDate = new Date();
  const inputDate = new Date(year, month - 1, day);

  if (inputDate > currentDate) {
    return { isValid: false, message: 'Date of birth cannot be in the future' };
  }

  const formatted = `${day.toString().padStart(2, '0')}-${month.toString().padStart(2, '0')}-${year}`;
  return { isValid: true, formatted };
};

/**
 * Formats contact number with hyphens as user types (real-time formatting)
 * @param {string} digits - Raw digits string
 * @returns {{ formatted: string, digitCount: number }}
 */
export const formatContactNumberRealTime = (digits) => {
  const len = digits.length;
  if (len === 0) return { formatted: '', digitCount: 0 };
  if (len > 15) digits = digits.slice(0, 15);

  let formatted = '';
  if (len <= 4) formatted = digits;
  else if (len <= 6) formatted = `${digits.slice(0, 4)}-${digits.slice(4)}`;
  else if (len <= 10) formatted = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
  else formatted = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 10)}-${digits.slice(10)}`;

  return { formatted, digitCount: len };
};

/**
 * Validates contact number length and returns formatted version
 * @param {string} digits - Raw digits string
 * @returns {{ isValid: boolean, formatted: string, message?: string }}
 */
export const validateContactNumber = (digits) => {
  const len = digits.length;
  if (len === 0) return { isValid: true, formatted: '' };
  if (len < 10 || len > 15) {
    return { isValid: false, message: 'Contact number must be between 10 and 15 digits' };
  }
  const result = formatContactNumberRealTime(digits);
  return { isValid: true, formatted: result.formatted };
};

/**
 * Normalize gender value
 * @param {string} gender
 * @returns {string} 'Male' | 'Female' | ''
 */
const normalizeGender = (gender = '') => {
  const g = String(gender).trim().toLowerCase();

  if (['male', 'm', 'boy', 'boys'].includes(g)) return 'Male';
  if (['female', 'f', 'girl', 'girls'].includes(g)) return 'Female';

  return '';
};

/**
 * Parse DOB safely from DD-MM-YYYY format
 * @param {string} dob
 * @returns {Date|null}
 */
const parseDobToDate = (dob) => {
  if (!dob || typeof dob !== 'string') return null;

  const parts = dob.split('-');
  if (parts.length !== 3) return null;

  let [day, month, year] = parts.map(Number);
  if ([day, month, year].some((num) => Number.isNaN(num))) return null;

  if (year < 100) year += year < 50 ? 2000 : 1900;

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

/**
 * Returns reference year for age calculation
 * Uses tournament date first so categories stay tied to tournament year
 * @param {Object} tournamentData
 * @returns {number}
 */
const getReferenceYear = (tournamentData) => {
  const tournamentDate =
    tournamentData?.dateFrom ||
    tournamentData?.startDate ||
    tournamentData?.tournamentDate ||
    null;

  if (tournamentDate) {
    const parsed = new Date(tournamentDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getFullYear();
    }
  }

  return new Date().getFullYear();
};

/**
 * Determines age category based on DOB and tournament data
 * @param {string} dob - Date of birth in DD-MM-YYYY
 * @param {Object} tournamentData - Tournament configuration
 * @returns {string} Age category or 'Not Eligible'
 */
export const getAgeCategory = (dob, tournamentData) => {
  if (!dob || !tournamentData) return '';

  const birthDate = parseDobToDate(dob);
  if (!birthDate) return 'Not Eligible';

  const referenceYear = getReferenceYear(tournamentData);
  const birthYear = birthDate.getFullYear();
  const age = referenceYear - birthYear;

  const allCategories = [
    ...(tournamentData.ageCategories?.open || []),
    ...(tournamentData.ageCategories?.official || []),
  ];

  const ageCriteria = {
    WT: {
      Senior: { min: 17 },
      Junior: { min: 15, max: 17 },
      Cadet: { min: 12, max: 14 },
      'Sub-Junior': { max: 11 },
    },
    SGFI: {
      'Under - 19': { max: 19 },
      'Under - 17': { max: 17 },
      'Under - 14': { max: 14 },
    },
  };

  const matches = [];

  allCategories.forEach((category) => {
    const criteria = ageCriteria.WT[category] || ageCriteria.SGFI[category];

    if (
      criteria &&
      (criteria.min === undefined || age >= criteria.min) &&
      (criteria.max === undefined || age <= criteria.max)
    ) {
      matches.push({
        category,
        max: criteria.max ?? Infinity,
        min: criteria.min ?? -Infinity,
      });
    }
  });

  if (matches.length === 0) return 'Not Eligible';

  // Most restrictive category wins:
  // 1) lower max age first
  // 2) if same max, higher min first
  const bestMatch = matches.reduce((best, curr) => {
    if (curr.max < best.max) return curr;
    if (curr.max === best.max && curr.min > best.min) return curr;
    return best;
  });

  return bestMatch.category;
};

/**
 * Clean numeric weight
 * @param {string|number} weight
 * @returns {number}
 */
const normalizeWeightNumber = (weight) => {
  if (weight === null || weight === undefined || weight === '') return NaN;
  const clean = String(weight).replace(/[^0-9.]/g, '');
  return parseFloat(clean);
};

/**
 * Extract category label from custom row/string
 * @param {string|Object} item
 * @returns {string}
 */
const getCategoryLabelFromItem = (item) => {
  if (typeof item === 'string') return item.trim();
  if (item && typeof item === 'object') {
    if (typeof item.category === 'string') return item.category.trim();
    if (typeof item.name === 'string') return item.name.trim();
    if (typeof item.label === 'string') return item.label.trim();
  }
  return '';
};

/**
 * Parse one weight label into range
 * Supports:
 * - Under 54kg
 * - Under - 54 KG
 * - 58kg
 * - 58 KG
 * - Over 87kg
 * - 87+ KG
 * - 148cm (33-45kg)
 * - Over 180cm (52-80kg)
 * - Under 54kg (Over 50kg)
 */
const parseWeightCategory = (label) => {
  if (!label) return null;

  const raw = String(label).trim();
  const lower = raw.toLowerCase();

  // Handle bracket range first: 148cm (33-45kg)
  const bracketRangeMatch = lower.match(/\((\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*kg\)/i);
  if (bracketRangeMatch) {
    const min = parseFloat(bracketRangeMatch[1]);
    const max = parseFloat(bracketRangeMatch[2]);

    return {
      label: raw,
      min,
      max,
      includeMin: true,
      includeMax: true,
    };
  }

  // Handle Under 54kg (Over 50kg)
  const underOverConditionMatch = lower.match(
    /under\s*-?\s*(\d+(?:\.\d+)?)\s*kg\s*\(\s*over\s*(\d+(?:\.\d+)?)\s*kg\s*\)/i
  );
  if (underOverConditionMatch) {
    return {
      label: raw,
      min: parseFloat(underOverConditionMatch[2]),
      max: parseFloat(underOverConditionMatch[1]),
      includeMin: false,
      includeMax: true,
    };
  }

  // Under 54kg / Under - 54 KG
  const underMatch = lower.match(/under\s*-?\s*(\d+(?:\.\d+)?)\s*kg/i);
  if (underMatch) {
    return {
      label: raw,
      min: -Infinity,
      max: parseFloat(underMatch[1]),
      includeMin: false,
      includeMax: true,
    };
  }

  // Over 87kg
  const overMatch = lower.match(/over\s*-?\s*(\d+(?:\.\d+)?)\s*kg/i);
  if (overMatch) {
    return {
      label: raw,
      min: parseFloat(overMatch[1]),
      max: Infinity,
      includeMin: false,
      includeMax: true,
    };
  }

  // 87+ KG
  const plusMatch = lower.match(/(\d+(?:\.\d+)?)\s*\+\s*kg/i);
  if (plusMatch) {
    return {
      label: raw,
      min: parseFloat(plusMatch[1]),
      max: Infinity,
      includeMin: true,
      includeMax: true,
    };
  }

  // Exact-like upper-bound style: 58kg / 58 KG
  const exactMatch = lower.match(/^(\d+(?:\.\d+)?)\s*kg$/i);
  if (exactMatch) {
    return {
      label: raw,
      min: -Infinity,
      max: parseFloat(exactMatch[1]),
      includeMin: false,
      includeMax: true,
    };
  }

  return null;
};

/**
 * Check if weight belongs to parsed range
 * @param {number} weightNum
 * @param {Object} parsed
 * @returns {boolean}
 */
const isWeightInCategory = (weightNum, parsed) => {
  if (!parsed || Number.isNaN(weightNum)) return false;

  const minOk = parsed.includeMin ? weightNum >= parsed.min : weightNum > parsed.min;
  const maxOk = parsed.includeMax ? weightNum <= parsed.max : weightNum < parsed.max;

  return minOk && maxOk;
};

/**
 * Returns allowed genders for specific age category from tournament config
 * @param {Object} tournamentData
 * @param {string} ageCategory
 * @returns {string[]}
 */
const getAllowedGendersForAgeCategory = (tournamentData, ageCategory) => {
  const fromOpen = tournamentData?.ageGender?.open?.[ageCategory];
  const fromOfficial = tournamentData?.ageGender?.official?.[ageCategory];

  if (Array.isArray(fromOpen) && fromOpen.length > 0) return fromOpen;
  if (Array.isArray(fromOfficial) && fromOfficial.length > 0) return fromOfficial;

  return ['Male', 'Female'];
};

/**
 * Returns standard WT/SGFI/custom labels for requested age and gender
 * @param {string} gender
 * @param {string} ageCategory
 * @param {Object} tournamentData
 * @returns {string[]}
 */
const getTournamentWeightLabels = (gender, ageCategory, tournamentData) => {
  if (!gender || !ageCategory || !tournamentData?.weightCategories) return [];

  const normalizedGender = normalizeGender(gender);
  if (!normalizedGender) return [];

  const allSelectedAgeCategories = [
    ...(tournamentData.ageCategories?.open || []),
    ...(tournamentData.ageCategories?.official || []),
  ];

  if (!allSelectedAgeCategories.includes(ageCategory)) return [];

  const allowedGenders = getAllowedGendersForAgeCategory(tournamentData, ageCategory);
  if (
    Array.isArray(allowedGenders) &&
    allowedGenders.length > 0 &&
    !allowedGenders.includes(normalizedGender)
  ) {
    return [];
  }

  const weightType = tournamentData.weightCategories?.type;

  // CUSTOM
  if (weightType === 'custom') {
    const custom = tournamentData.weightCategories?.custom || {};
    const ageBlock = custom?.[ageCategory];

    // New structure: { Senior: { Male: [...], Female: [...] } }
    if (ageBlock && typeof ageBlock === 'object' && !Array.isArray(ageBlock)) {
      return (ageBlock?.[normalizedGender] || [])
        .map(getCategoryLabelFromItem)
        .filter(Boolean);
    }

    // Legacy structure: { Senior: [...] }
    if (Array.isArray(ageBlock)) {
      return ageBlock.map(getCategoryLabelFromItem).filter(Boolean);
    }

    return [];
  }

  // WT
  if (weightType === 'WT') {
    if (ageCategory === 'Cadet') {
      const cadetMode = tournamentData?.cadetCategoryType === 'height' ? 'height' : 'weight';
      const cadetList = WT_WEIGHTS?.Cadet?.[cadetMode]?.[normalizedGender] || [];
      return Array.isArray(cadetList) ? cadetList : [];
    }

    const wtList = WT_WEIGHTS?.[ageCategory]?.[normalizedGender] || [];
    return Array.isArray(wtList) ? wtList : [];
  }

  // SGFI
  if (weightType === 'SGFI') {
    const sgfiList = SGFI_WEIGHTS?.[ageCategory]?.[normalizedGender] || [];
    return Array.isArray(sgfiList) ? sgfiList : [];
  }

  // Fallback for older selected structure if it exists
  const fallbackGenderKey = normalizedGender.toLowerCase();
  const fallbackSelected = tournamentData.weightCategories?.selected?.[fallbackGenderKey] || [];
  return Array.isArray(fallbackSelected) ? fallbackSelected.map(getCategoryLabelFromItem).filter(Boolean) : [];
};

/**
 * Determines weight category based on gender, age category, weight, and tournament data
 * @param {string} gender - 'Male' or 'Female'
 * @param {string} ageCategory - Age category string
 * @param {string|number} weight - Weight value (e.g., "45", "45 KG", 45.5)
 * @param {Object} tournamentData - Tournament configuration
 * @returns {string} Weight category or 'Not Eligible'
 */
export const getWeightCategory = (gender, ageCategory, weight, tournamentData) => {
  if (!gender || !ageCategory || !weight || !tournamentData) return '';
  if (ageCategory === 'Not Eligible') return 'Not Eligible';

  const normalizedGender = normalizeGender(gender);
  const weightNum = normalizeWeightNumber(weight);

  if (!normalizedGender || Number.isNaN(weightNum)) return 'Not Eligible';

  const labels = getTournamentWeightLabels(normalizedGender, ageCategory, tournamentData);
  if (!Array.isArray(labels) || labels.length === 0) return 'Not Eligible';

  const parsedCategories = labels
    .map((label) => ({
      original: label,
      parsed: parseWeightCategory(label),
    }))
    .filter((item) => item.parsed);

  if (parsedCategories.length === 0) return 'Not Eligible';

  const matched = parsedCategories.find((item) => isWeightInCategory(weightNum, item.parsed));

  return matched ? matched.original : 'Not Eligible';
};

/**
 * Counts players per group using flat key (high performance)
 * @param {Array} data - Full data array
 * @returns {Object} Flat count object: "team|||gender|||age|||weight" → count
 */
export const getPlayerCounts = (data = []) => {
  const counts = {};

  data.forEach((row) => {
    const { team, gender, ageCategory, weightCategory } = row || {};

    if (!team || !gender || !ageCategory || !weightCategory || weightCategory === 'Not Eligible') {
      return;
    }

    // Flat unique key (||| separator safe hai)
    const key = `${team.trim()}|||${gender.trim()}|||${ageCategory.trim()}|||${weightCategory.trim()}`;

    counts[key] = (counts[key] || 0) + 1;
  });

  return counts;
};

/**
 * Checks if subEvent is Kyorugi (used for sorting/filtering)
 * @param {string} subEvent - Sub event value
 * @returns {boolean}
 */
export const isKyorugi = (subEvent) => {
  return subEvent?.toLowerCase()?.includes('kyorugi') || subEvent === 'K';
};

/**
 * Should the row be highlighted (red) if exceeding player limit
 * @param {Object} row - TanStack row object
 * @param {Array} data - Full data array
 * @param {Object} tournamentData - Tournament config
 * @returns {boolean}
 */
export const shouldHighlightRow = (row, data, tournamentData) => {
  const { team, gender, ageCategory, weightCategory } = row.original || {};

  if (!team || !gender || !ageCategory || !weightCategory || weightCategory === 'Not Eligible') {
    return false;
  }

  const officialCategories = tournamentData?.ageCategories?.official || [];
  if (!officialCategories.includes(ageCategory)) return false;

  const playerLimit = tournamentData?.playerLimit;
  if (!playerLimit) return false;

  const count = data.filter(
    (r) =>
      r.team === team &&
      r.gender === gender &&
      r.ageCategory === ageCategory &&
      r.weightCategory === weightCategory &&
      r.weightCategory !== 'Not Eligible'
  ).length;

  return count > playerLimit;
};