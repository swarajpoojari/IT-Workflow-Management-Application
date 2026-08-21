export class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expected = true;
  }

  static badRequest(message, details, code = 'BAD_REQUEST') {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHENTICATED') {
    return new ApiError(401, code, message);
  }

  static forbidden(message = 'You do not have permission to perform this action', details, code = 'FORBIDDEN') {
    return new ApiError(403, code, message, details);
  }

  static notFound(resource = 'Resource') {
    return new ApiError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(message, details, code = 'CONFLICT') {
    return new ApiError(409, code, message, details);
  }

  static unprocessable(message, details, code = 'UNPROCESSABLE') {
    return new ApiError(422, code, message, details);
  }
}
