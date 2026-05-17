import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/requireAuth.js";
import { sendError } from "../http/errors.js";
import { parseBody, parseParams } from "../http/validation.js";
import {
	confirmBabyAvatarForUser,
	createBabyAvatarUploadForUser,
	createBabyForUser,
	deleteBabyForUser,
	listBabiesForUser,
	removeBabyAvatarForUser,
	updateBabyForUser,
} from "../services/babies.js";

const router = Router();

function isValidDateString(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}

	const date = new Date(`${value}T00:00:00.000Z`);

	return (
		!Number.isNaN(date.getTime()) &&
		date.toISOString().slice(0, 10) === value
	);
}

function isValidTimeZone(value) {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
		return true;
	} catch {
		return false;
	}
}

const createBabySchema = z.object({
	name: z.string().trim().min(1).max(80),
	birthdate: z.string().refine(isValidDateString, "Must be a valid YYYY-MM-DD date."),
	sex: z.enum(["GIRL", "BOY"]).default("BOY"),
	timezone: z.string().trim().min(1).refine(isValidTimeZone, "Must be a valid timezone.").default("America/Los_Angeles"),
	avatarObjectKey: z.string().trim().min(1).nullable().optional(),
	role: z.enum(["FATHER", "MOTHER", "CAREGIVER"]).default("MOTHER"),
});

const updateBabySchema = z.object({
	name: z.string().trim().min(1).max(80),
	birthdate: z.string().refine(isValidDateString, "Must be a valid YYYY-MM-DD date."),
	sex: z.enum(["GIRL", "BOY"]),
	timezone: z.string().trim().min(1).refine(isValidTimeZone, "Must be a valid timezone.").optional(),
});

const avatarUploadSchema = z.object({
	contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

const avatarConfirmSchema = z.object({
	objectKey: z.string().trim().min(1).max(500),
});

const babyIdParamsSchema = z.object({
	babyId: z.uuid(),
});

router.use(requireAuth);

function sendParsedError(res, parsed) {
	return sendError(
		res,
		400,
		parsed.error.code,
		parsed.error.message,
		parsed.error.details,
	);
}

function sendBabyServiceError(res, code) {
	if (code === "INVALID_AVATAR_OBJECT_KEY") {
		return sendError(
			res,
			400,
			"INVALID_AVATAR_OBJECT_KEY",
			"Avatar object key is not valid for this baby.",
		);
	}

	if (code === "INVALID_AVATAR_CONTENT_TYPE") {
		return sendError(
			res,
			400,
			"INVALID_AVATAR_CONTENT_TYPE",
			"Avatar image type is not supported.",
		);
	}

	return sendError(
		res,
		404,
		"BABY_NOT_FOUND",
		"Baby was not found for the current user.",
	);
}

router.get("/", async (req, res, next) => {
	try {
		const babies = await listBabiesForUser(req.user.id);

		return res.json({ babies });
	} catch (error) {
		return next(error);
	}
});

router.post("/", async (req, res, next) => {
	try {
		const parsed = parseBody(createBabySchema, req.body);

		if (parsed.error) {
			return sendParsedError(res, parsed);
		}

		const result = await createBabyForUser(req.user.id, parsed.data);

		return res.status(201).json(result);
	} catch (error) {
		return next(error);
	}
});

router.patch("/:babyId", async (req, res, next) => {
	try {
		const parsedParams = parseParams(babyIdParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const parsedBody = parseBody(updateBabySchema, req.body);

		if (parsedBody.error) {
			return sendParsedError(res, parsedBody);
		}

		const result = await updateBabyForUser(
			req.user.id,
			parsedParams.data.babyId,
			parsedBody.data,
		);

		if (!result) {
			return sendError(
				res,
				404,
				"BABY_NOT_FOUND",
				"Baby was not found for the current user.",
			);
		}

		return res.json(result);
	} catch (error) {
		return next(error);
	}
});

router.post("/:babyId/avatar/presign-upload", async (req, res, next) => {
	try {
		const parsedParams = parseParams(babyIdParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const parsedBody = parseBody(avatarUploadSchema, req.body);

		if (parsedBody.error) {
			return sendParsedError(res, parsedBody);
		}

		const result = await createBabyAvatarUploadForUser(
			req.user.id,
			parsedParams.data.babyId,
			parsedBody.data,
		);

		if (result.error) {
			return sendBabyServiceError(res, result.error);
		}

		return res.json(result);
	} catch (error) {
		return next(error);
	}
});

router.post("/:babyId/avatar/confirm", async (req, res, next) => {
	try {
		const parsedParams = parseParams(babyIdParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const parsedBody = parseBody(avatarConfirmSchema, req.body);

		if (parsedBody.error) {
			return sendParsedError(res, parsedBody);
		}

		const result = await confirmBabyAvatarForUser(
			req.user.id,
			parsedParams.data.babyId,
			parsedBody.data,
		);

		if (result.error) {
			return sendBabyServiceError(res, result.error);
		}

		return res.json(result);
	} catch (error) {
		return next(error);
	}
});

router.delete("/:babyId/avatar", async (req, res, next) => {
	try {
		const parsedParams = parseParams(babyIdParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const result = await removeBabyAvatarForUser(
			req.user.id,
			parsedParams.data.babyId,
		);

		if (result.error) {
			return sendBabyServiceError(res, result.error);
		}

		return res.json(result);
	} catch (error) {
		return next(error);
	}
});

router.delete("/:babyId", async (req, res, next) => {
	try {
		const parsed = parseParams(babyIdParamsSchema, req.params);

		if (parsed.error) {
			return sendParsedError(res, parsed);
		}

		const { babyId } = parsed.data;
		const deleted = await deleteBabyForUser(req.user.id, babyId);

		if (!deleted) {
			return sendBabyServiceError(res, "BABY_NOT_FOUND");
		}

		return res.status(204).send();
	} catch (error) {
		return next(error);
	}
});

export default router;
