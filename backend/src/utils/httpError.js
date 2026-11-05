// Creates an Error with an HTTP status code, so errorHandler can send the right response.
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = httpError;
