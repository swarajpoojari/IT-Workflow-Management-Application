import { ApiError } from '../utils/ApiError.js';

export function validate(schemas) {
  return function validator(req, _res, next) {
    for (const key of ['body', 'query', 'params']) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key]);
      if (!result.success) {
        const details = result.error.issues.map((issue) => ({
          field: issue.path.join('.') || key,
          message: issue.message,
        }));
        return next(ApiError.badRequest('Validation failed', details, 'VALIDATION_ERROR'));
      }
      try {
        req[key] = result.data;
      } catch {
        Object.defineProperty(req, key, { value: result.data, writable: true, configurable: true });
      }
    }
    return next();
  };
}
