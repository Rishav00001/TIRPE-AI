function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'NotFound',
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  console.error('Unhandled error', {
    path: req.originalUrl,
    method: req.method,
    message: error.message,
    stack: error.stack,
  });

  return res.status(error.statusCode || 500).json({
    error: error.name || 'InternalServerError',
    message: error.message || 'Unexpected error',
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
