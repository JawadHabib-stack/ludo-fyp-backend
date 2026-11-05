// Turns any thrown error into a JSON response: { success: false, message }.
// Express 5 sends errors from async route handlers here automatically.
function errorHandler(err, req, res, next) {
  // Duplicate value on a UNIQUE column (e.g. username already taken)
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ success: false, message: 'Already exists' });
  }

  // Bad JSON in the request body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON body' });
  }

  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({
    success: false,
    message: status === 500 ? 'Server error' : err.message,
  });
}

module.exports = errorHandler;
