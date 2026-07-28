const INDIA_TIME_ZONE = "Asia/Kolkata";
const INDIA_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const getIndiaDateParts = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
};

export const toIndiaDayStart = (value) => {
  const parts = getIndiaDateParts(value);
  if (!parts) return null;

  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day) - INDIA_OFFSET_MS
  );
};

export const getCurrentIndiaDayStart = (now = new Date()) =>
  toIndiaDayStart(now);

export const getTournamentDayEnd = (value) => {
  const start = toIndiaDayStart(value);
  return start ? new Date(start.getTime() + DAY_MS - 1) : null;
};

export const addIndiaCalendarDays = (value, days) => {
  const start = toIndiaDayStart(value);
  return start ? new Date(start.getTime() + Number(days) * DAY_MS) : null;
};
