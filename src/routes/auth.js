import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/requireAuth.js";
import { getSupabaseAuthClient } from "../auth/supabase.js";
import { sendError } from "../http/errors.js";
import { parseBody } from "../http/validation.js";
import { syncSupabaseUser } from "../services/users.js";

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

router.get("/me", requireAuth, async (req, res, next) => {
	try {
		return res.json({
			user: req.user,
		});
	} catch (error) {
		next(error);
	}
});

export default router;
