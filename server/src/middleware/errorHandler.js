import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export function notFound(req, _res, next) {
  next(new ApiError(404, 'ROUTE_NOT_FOUND', `Cannot ${req.method} ${req.originalUrl}`));
}

export function errorHandler(error, req, res, _next) {
  const isExpected = error instanceof ApiError || error?.expected === true;

  if (!isExpected && error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({
      error: { code: 'DUPLICATE', message: 'A record with these details already exists' },
    });
  }
  if (!isExpected && typeof error?.message === 'string' && error.message.includes('SOP_VERSION_IMMUTABLE')) {
    return res.status(409).json({
      error: {
        code: 'SOP_VERSION_IMMUTABLE',
        message: 'This SOP version is published and can no longer be modified. Edit the draft instead.',
      },
    });
  }

  const status = isExpected ? error.status : 500;

  if (!isExpected) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, error);
  }

  res.status(status).json({
    error: {
      code: isExpected ? error.code : 'INTERNAL_ERROR',
      message: isExpected ? error.message : 'Something went wrong on our side',
      ...(isExpected && error.details ? { details: error.details } : {}),
      ...(!isExpected && !env.isProd ? { debug: error.message } : {}),
    },
  });
}
