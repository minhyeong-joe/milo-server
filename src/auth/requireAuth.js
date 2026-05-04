import { getSupabaseAuthClient } from "./supabase.js";
import {
	findAppUserForSupabaseUser,
	syncSupabaseUser,
} from "../services/users.js";

function sendError(res, status, code, message, details = {}) {
	return res.status(status).json({
		error: {
			code,
			message,
			details,
		},
	});
}

function getBearerToken(req) {
	const header = req.get("authorization");

	if (!header) {
		return null;
	}

	const [scheme, token] = header.split(" ");

	if (scheme?.toLowerCase() !== "bearer" || !token) {
		return null;
	}

	return token;
}

export async function requireAuth(req, res, next) {
	try {
		const accessToken = getBearerToken(req);

		if (!accessToken) {
			return sendError(
				res,
				401,
				"AUTH_TOKEN_REQUIRED",
				"Bearer access token is required.",
			);
		}

		const supabase = getSupabaseAuthClient();
		const { data, error } = await supabase.auth.getUser(accessToken);

		if (error || !data.user) {
			return sendError(
				res,
				401,
				"INVALID_AUTH_TOKEN",
				"Auth token is invalid.",
			);
		}

		req.user =
			(await findAppUserForSupabaseUser(data.user)) ??
			(await syncSupabaseUser(data.user));

		return next();
	} catch (error) {
		return next(error);
	}
}
