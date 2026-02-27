// src/components/Entry/helpers.js

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
 * Determines age category based on DOB and tournament data
 * @param {string} dob - Date of birth in DD-MM-YYYY
 * @param {Object} tournamentData - Tournament configuration
 * @returns {string} Age category or 'Not Eligible'
 */
export const getAgeCategory = (dob, tournamentData) => {
  if (!dob || !tournamentData) return '';

  const currentYear = new Date().getFullYear();
  const birthDate = new Date(dob.split('-').reverse().join('-'));
  if (isNaN(birthDate.getTime())) return 'Not Eligible';

  const birthYear = birthDate.getFullYear();
  const age = currentYear - birthYear;

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
    if (criteria && (criteria.min === undefined || age >= criteria.min) && (criteria.max === undefined || age <= criteria.max)) {
      matches.push({ category, max: criteria.max || Infinity });
    }
  });

  if (matches.length === 0) return 'Not Eligible';

  // Most restrictive (lowest max age) wins
  const bestMatch = matches.reduce((best, curr) => (curr.max < best.max ? curr : best));
  return bestMatch.category;
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
  if (!gender || !ageCategory || !weight || !tournamentData || ageCategory === 'Not Eligible') {
    return '';
  }

  // Clean weight: remove non-digits except decimal
  const cleanWeight = String(weight).replace(/[^0-9.]/g, '');
  const weightNum = parseFloat(cleanWeight);
  if (isNaN(weightNum)) return 'Not Eligible';

  const weightCategories = tournamentData.weightCategories?.selected || {};
  const genderKey = gender.toLowerCase() === 'male' ? 'male' : 'female';
  const categories = weightCategories[genderKey] || [];

  if (!Array.isArray(categories) || categories.length === 0) return 'Not Eligible';

  // Parse range from category string
  const parseWeightRange = (categoryStr) => {
    const match = categoryStr.match(/(Under|Over|\d+\+)\s*-?\s*(\d*)\s*KG\s*(?:\((.*?)\))?/i);
    if (!match) return null;

    let type = match[1];
    let kg = parseFloat(match[2] || 0);
    let condition = match[3] || '';

    let min = -Infinity;
    let max = Infinity;

    if (type.includes('+')) {
      min = kg;
      type = 'Over';
    } else if (type === 'Under') {
      max = kg;
      if (condition.toLowerCase().includes('over')) {
        const overMatch = condition.match(/Over\s*(\d+)kg/i);
        min = overMatch ? parseFloat(overMatch[1]) : -Infinity;
      }
    } else if (type === 'Over') {
      min = kg;
    }

    const name = type === 'Over' && kg > 0 ? `${kg}+ KG` : `${type} - ${kg} KG`;
    return { name, min, max };
  };

  const parsed = categories.map(parseWeightRange).filter(Boolean);

  const match = parsed.find(cat => weightNum > cat.min && weightNum <= cat.max);
  return match ? match.name : 'Not Eligible';
};

/**
 * Counts players per group using flat key (high performance)
 * @param {Array} data - Full data array
 * @returns {Object} Flat count object: "team|||gender|||age|||weight" → count
 */
export const getPlayerCounts = (data = []) => {
  const counts = {};

  data.forEach(row => {
    const { team, gender, ageCategory, weightCategory } = row || {};
    
    if (!team || !gender || !ageCategory || !weightCategory || 
        weightCategory === 'Not Eligible') {
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

  if (!team || !gender || !ageCategory || !weightCategory || 
      weightCategory === 'Not Eligible') {
    return false;
  }

  const officialCategories = tournamentData?.ageCategories?.official || [];
  if (!officialCategories.includes(ageCategory)) return false;

  const playerLimit = tournamentData?.playerLimit;
  if (!playerLimit) return false;

  const count = data.filter(r =>
    r.team === team &&
    r.gender === gender &&
    r.ageCategory === ageCategory &&
    r.weightCategory === weightCategory &&
    r.weightCategory !== 'Not Eligible'
  ).length;

  return count > playerLimit;
};