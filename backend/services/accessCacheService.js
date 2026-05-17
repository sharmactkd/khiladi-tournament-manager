const cache = new Map();

const DEFAULT_TTL_MS = Number(process.env.ACCESS_CACHE_TTL_MS || 30 * 1000);

const getNow = () => Date.now();

export const buildAccessCacheKey = ({
  userId,
  tournamentId = "",
  feature = "",
}) => {
  return [
    String(userId || ""),
    String(tournamentId || ""),
    String(feature || ""),
  ].join(":");
};

export const getCachedAccess = (key) => {
  const item = cache.get(key);

  if (!item) return null;

  if (item.expiresAt <= getNow()) {
    cache.delete(key);
    return null;
  }

  return item.value;
};

export const setCachedAccess = (key, value, ttlMs = DEFAULT_TTL_MS) => {
  cache.set(key, {
    value,
    expiresAt: getNow() + ttlMs,
  });

  return value;
};

export const clearAccessCache = () => {
  cache.clear();
};

export const clearUserAccessCache = (userId) => {
  const prefix = `${String(userId || "")}:`;

  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
};