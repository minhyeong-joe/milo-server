export function sendError(res, status, code, message, details = {}) {
	return res.status(status).json({
		error: {
			code,
			message,
			details,
		},
	});
}

export function notFoundHandler(req, res) {
	return sendError(res, 404, "NOT_FOUND", "Not found");
}

export function errorHandler(err, req, res, next) {
	console.error(err);

	return sendError(
		res,
		err.status || 500,
		"INTERNAL_SERVER_ERROR",
		process.env.NODE_ENV === "prod" ? "Internal server error" : err.message,
	);
}
