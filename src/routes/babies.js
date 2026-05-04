import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/requireAuth.js";
import {
	createBabyForUser,
	deleteBabyForUser,
	listBabiesForUser,
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

const createBabySchema = z.object({
	name: z.string().trim().min(1).max(80),
	birthdate: z.string().refine(isValidDateString, "Must be a valid YYYY-MM-DD date."),
	sex: z.enum(["GIRL", "BOY"]).default("BOY"),
	timezone: z.string().trim().min(1).default("America/Los_Angeles"),
	avatarObjectKey: z.string().trim().min(1).nullable().optional(),
	role: z.enum(["FATHER", "MOTHER", "CAREGIVER"]).default("MOTHER"),
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

router.use(requireAuth);

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
			return sendError(
				res,
				400,
				parsed.error.code,
				parsed.error.message,
				parsed.error.details,
			);
		}

		const result = await createBabyForUser(req.user.id, parsed.data);

		return res.status(201).json(result);
	} catch (error) {
		return next(error);
	}
});

router.delete("/:babyId", async (req, res, next) => {
	try {
		const { babyId } = req.params;
		const babyIdResult = z.uuid().safeParse(babyId);

		if (!babyIdResult.success) {
			return sendError(
				res,
				400,
				"VALIDATION_ERROR",
				"Baby ID must be a valid UUID.",
				z.treeifyError(babyIdResult.error),
			);
		}

		const deleted = await deleteBabyForUser(req.user.id, babyId);

		if (!deleted) {
			return sendError(
				res,
				404,
				"BABY_NOT_FOUND",
				"Baby was not found for the current user.",
			);
		}

		return res.status(204).send();
	} catch (error) {
		return next(error);
	}
});

export default router;
