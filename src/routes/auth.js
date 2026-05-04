import { Router } from "express";
import { z } from "zod";
import { getSupabaseAuthClient } from "../auth/supabase.js";
import {
	findAppUserForSupabaseUser,
	syncSupabaseUser,
} from "../services/users.js";

const router = Router();

const signupSchema = z.object({
	email: z.email().transform((email) => email.trim().toLowerCase()),
	password: z.string().min(8),
	displayName: z.string().trim().min(1).max(20).optional(),
});

const signinSchema = z.object({
	email: z.email().transform((email) => email.trim().toLowerCase()),
	password: z.string().min(1),
});

function sendError(res, status, code, message, details = {}) {
	return res.status(status).json({
		error: {
			code,
			message,
			details,
		},
	});
}

function parseBody(schema, body) {
	const result = schema.safeParse(body);

	if (!result.success) {
		return {
			error: {
				code: "VALIDATION_ERROR",
				message: "Request body is invalid.",
				details: z.treeifyError(result.error),
			},
		};
	}

	return { data: result.data };
}

function isInvalidCredentialsError(error) {
	const message = error?.message?.toLowerCase() ?? "";
	return (
		error?.status === 400 ||
		error?.status === 401 ||
		message.includes("invalid login credentials")
	);
}

function isRealSignupUser(user) {
	if (!user?.id) {
		return false;
	}

	if (!Array.isArray(user.identities)) {
		return true;
	}

	return user.identities.length > 0;
}

function serializeSession(session) {
	if (!session) {
		return null;
	}

	return {
		accessToken: session.access_token,
		refreshToken: session.refresh_token,
		expiresIn: session.expires_in,
		expiresAt: session.expires_at,
		tokenType: session.token_type,
	};
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

router.post("/signup", async (req, res, next) => {
	try {
		const parsed = parseBody(signupSchema, req.body);

		if (parsed.error) {
			return sendError(
				res,
				400,
				parsed.error.code,
				parsed.error.message,
				parsed.error.details,
			);
		}

		const { email, password, displayName } = parsed.data;
		const supabase = getSupabaseAuthClient();
		const { data, error } = await supabase.auth.signUp({
			email,
			password,
			options: {
				data: {
					displayName,
				},
			},
		});

		if (error) {
			return sendError(
				res,
				error.status || 400,
				"SIGNUP_FAILED",
				error.message,
			);
		}

		const appUser = isRealSignupUser(data.user)
			? await syncSupabaseUser(data.user, { displayName })
			: null;

		return res.status(201).json({
			user: appUser,
			session: serializeSession(data.session),
			emailConfirmationRequired: !data.session,
		});
	} catch (error) {
		next(error);
	}
});

router.post("/signin", async (req, res, next) => {
	try {
		const parsed = parseBody(signinSchema, req.body);

		if (parsed.error) {
			return sendError(
				res,
				400,
				parsed.error.code,
				parsed.error.message,
				parsed.error.details,
			);
		}

		const { email, password } = parsed.data;
		const supabase = getSupabaseAuthClient();
		const { data, error } = await supabase.auth.signInWithPassword({
			email,
			password,
		});

		if (error) {
			if (isInvalidCredentialsError(error)) {
				return sendError(
					res,
					401,
					"INVALID_CREDENTIALS",
					"Email or password is incorrect.",
				);
			}

			return sendError(
				res,
				error.status || 400,
				"SIGNIN_FAILED",
				error.message,
			);
		}

		const appUser = await syncSupabaseUser(data.user);

		return res.json({
			...serializeSession(data.session),
			user: appUser,
		});
	} catch (error) {
		next(error);
	}
});

router.get("/me", async (req, res, next) => {
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

		const appUser =
			(await findAppUserForSupabaseUser(data.user)) ??
			(await syncSupabaseUser(data.user));

		return res.json({
			user: appUser,
		});
	} catch (error) {
		next(error);
	}
});

export default router;
