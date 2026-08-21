import { CLIENT_RESTRICTED_FIELDS } from '../config/constants.js';

const RESTRICTED = new Set(CLIENT_RESTRICTED_FIELDS);

// Recursively removes restricted fields and hidden stages.
export function stripForClient(value, depth = 0) {
  if (depth > 12 || value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value
      // Hidden stages are removed, not blanked, so their existence stays invisible.
      .filter((item) => !(item && typeof item === 'object' && item.clientVisible === false))
      .map((item) => stripForClient(item, depth + 1));
  }

  if (typeof value !== 'object' || value instanceof Date) return value;

  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (RESTRICTED.has(key)) continue;
    out[key] = stripForClient(child, depth + 1);
  }
  return out;
}

// Mounted globally, so no route can forget it.
export function filterClientData(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (!req.user?.isClientScope) return originalJson(body);

    res.setHeader('X-Client-Filtered', 'true');
    return originalJson(stripForClient(body));
  };

  next();
}
