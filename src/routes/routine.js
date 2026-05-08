import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/requireAuth.js";
import { sendError } from "../http/errors.js";
import { parseBody, parseParams, parseQuery } from "../http/validation.js";
import {
	createRoutineLogForUser,
	deleteRoutineLogForUser,
	getRoutineDaysForUser,
	getRoutineStatsForUser,
	updateRoutineLogForUser,
} from "../services/routine.js";

const router = Router({ mergeParams: true });

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

function isValidIsoDateTime(value) {
	return !Number.isNaN(new Date(value).getTime());
}

const notesSchema = z.string().trim().max(100).optional();
const isoDateTimeSchema = z.string().refine(isValidIsoDateTime, "Must be a valid ISO timestamp.");
const dateStringSchema = z.string().refine(isValidDateString, "Must be a valid YYYY-MM-DD date.");
const mealTypeSchema = z.enum(["breastfeed", "breastMilk", "formula", "solid"]);
const diaperTypeSchema = z.enum(["wet", "dirty", "both", "dry"]);
const diaperColorSchema = z.enum(["green", "brown", "yellow", "black"]);
const sleepTypeSchema = z.enum(["nap", "nighttime"]);
const kindSchema = z.enum(["meal", "diaper", "sleep"]);
const amountBowlSchema = z.union([
	z.literal(0.25),
	z.literal(0.5),
	z.literal(0.75),
	z.literal(1),
]);
const clientMutationIdSchema = z.uuid().optional();

function refineMealPayload(value, ctx) {
	if (value.type === "breastfeed" && value.durationMinutes === undefined) {
		ctx.addIssue({
			code: "custom",
			path: ["durationMinutes"],
			message: "durationMinutes is required for breastfeed meals.",
		});
	}

	if ((value.type === "breastMilk" || value.type === "formula") && value.amountMl === undefined) {
		ctx.addIssue({
			code: "custom",
			path: ["amountMl"],
			message: "amountMl is required for bottle meals.",
		});
	}

	if (value.type === "solid" && value.amountBowl === undefined && value.amountGrams === undefined) {
		ctx.addIssue({
			code: "custom",
			path: ["amountBowl"],
			message: "amountBowl or amountGrams is required for solid meals.",
		});
	}

	if (value.type === "solid" && value.amountBowl !== undefined && value.amountGrams !== undefined) {
		ctx.addIssue({
			code: "custom",
			path: ["amountGrams"],
			message: "Use either amountBowl or amountGrams for solid meals, not both.",
		});
	}
}

function refineSleepPayload(value, ctx) {
	if (value.endTime && new Date(value.endTime).getTime() < new Date(value.startTime).getTime()) {
		ctx.addIssue({
			code: "custom",
			path: ["endTime"],
			message: "endTime must be on or after startTime.",
		});
	}
}

const babyParamsSchema = z.object({
	babyId: z.uuid(),
});

const routineLogParamsSchema = babyParamsSchema.extend({
	kind: kindSchema,
	id: z.uuid(),
});

const routineDaysQuerySchema = z
	.object({
		startDate: dateStringSchema,
		count: z.coerce.number().int().positive().max(30).default(7),
		includeLastLogged: z
			.enum(["true", "false"])
			.optional()
			.transform((value) => value === "true"),
	});

const routineStatsQuerySchema = z
	.object({
		startDate: dateStringSchema,
		endDate: dateStringSchema,
	})
	.superRefine((value, ctx) => {
		if (value.endDate < value.startDate) {
			ctx.addIssue({
				code: "custom",
				path: ["endDate"],
				message: "endDate must be on or after startDate.",
			});
		}
	});

const mealFields = {
	clientMutationId: clientMutationIdSchema,
	time: isoDateTimeSchema,
	type: mealTypeSchema,
	amountMl: z.number().int().positive().optional(),
	durationMinutes: z.number().int().positive().optional(),
	amountBowl: amountBowlSchema.optional(),
	amountGrams: z.number().int().positive().optional(),
	breastSide: z.enum(["left", "right"]).optional(),
	notes: notesSchema,
};

const diaperFields = {
	clientMutationId: clientMutationIdSchema,
	time: isoDateTimeSchema,
	type: diaperTypeSchema,
	color: diaperColorSchema.optional(),
	notes: notesSchema,
};

const sleepFields = {
	clientMutationId: clientMutationIdSchema,
	type: sleepTypeSchema,
	startTime: isoDateTimeSchema,
	endTime: isoDateTimeSchema.optional(),
	notes: notesSchema,
};

const mealPayloadSchema = z
	.object({ kind: z.literal("meal"), ...mealFields })
	.superRefine(refineMealPayload);

const diaperPayloadSchema = z.object({ kind: z.literal("diaper"), ...diaperFields });

const sleepPayloadSchema = z
	.object({ kind: z.literal("sleep"), ...sleepFields })
	.superRefine(refineSleepPayload);

const createRoutineLogSchema = z.discriminatedUnion("kind", [
	mealPayloadSchema,
	diaperPayloadSchema,
	sleepPayloadSchema,
]);

const updateSchemasByKind = {
	meal: z.object(mealFields).superRefine(refineMealPayload),
	diaper: z.object(diaperFields),
	sleep: z.object(sleepFields).superRefine(refineSleepPayload),
};

function sendParsedError(res, parsed) {
	return sendError(
		res,
		400,
		parsed.error.code,
		parsed.error.message,
		parsed.error.details,
	);
}

function sendRoutineServiceError(res, code) {
	if (code === "BABY_NOT_FOUND") {
		return sendError(
			res,
			404,
			"BABY_NOT_FOUND",
			"Baby was not found for the current user.",
		);
	}

	if (code === "ACTIVE_SLEEP_EXISTS") {
		return sendError(
			res,
			409,
			"ACTIVE_SLEEP_EXISTS",
			"A sleep session is already active for this baby.",
		);
	}

	return sendError(
		res,
		404,
		"ROUTINE_LOG_NOT_FOUND",
		"Routine log was not found for the current baby.",
	);
}

router.use(requireAuth);

router.get("/days", async (req, res, next) => {
	try {
		const parsedParams = parseParams(babyParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const parsedQuery = parseQuery(routineDaysQuerySchema, req.query);

		if (parsedQuery.error) {
			return sendParsedError(res, parsedQuery);
		}

		const result = await getRoutineDaysForUser(
			req.user.id,
			parsedParams.data.babyId,
			parsedQuery.data.startDate,
			parsedQuery.data.count,
			parsedQuery.data.includeLastLogged,
		);

		if (!result) {
			return sendRoutineServiceError(res, "BABY_NOT_FOUND");
		}

		return res.json(result);
	} catch (error) {
		return next(error);
	}
});

router.get("/stats", async (req, res, next) => {
	try {
		const parsedParams = parseParams(babyParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const parsedQuery = parseQuery(routineStatsQuerySchema, req.query);

		if (parsedQuery.error) {
			return sendParsedError(res, parsedQuery);
		}

		const result = await getRoutineStatsForUser(
			req.user.id,
			parsedParams.data.babyId,
			parsedQuery.data.startDate,
			parsedQuery.data.endDate,
		);

		if (!result) {
			return sendRoutineServiceError(res, "BABY_NOT_FOUND");
		}

		return res.json(result);
	} catch (error) {
		return next(error);
	}
});

router.post("/logs", async (req, res, next) => {
	try {
		const parsedParams = parseParams(babyParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const parsedBody = parseBody(createRoutineLogSchema, req.body);

		if (parsedBody.error) {
			return sendParsedError(res, parsedBody);
		}

		const result = await createRoutineLogForUser(
			req.user.id,
			parsedParams.data.babyId,
			parsedBody.data,
		);

		if (result.error) {
			return sendRoutineServiceError(res, result.error);
		}

		return res.status(201).json(result);
	} catch (error) {
		return next(error);
	}
});

router.patch("/logs/:kind/:id", async (req, res, next) => {
	try {
		const parsedParams = parseParams(routineLogParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const { babyId, kind, id } = parsedParams.data;
		const parsedBody = parseBody(updateSchemasByKind[kind], req.body);

		if (parsedBody.error) {
			return sendParsedError(res, parsedBody);
		}

		const result = await updateRoutineLogForUser(
			req.user.id,
			babyId,
			kind,
			id,
			parsedBody.data,
		);

		if (result.error) {
			return sendRoutineServiceError(res, result.error);
		}

		return res.json(result);
	} catch (error) {
		return next(error);
	}
});

router.delete("/logs/:kind/:id", async (req, res, next) => {
	try {
		const parsedParams = parseParams(routineLogParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const { babyId, kind, id } = parsedParams.data;
		const result = await deleteRoutineLogForUser(req.user.id, babyId, kind, id);

		if (result.error) {
			return sendRoutineServiceError(res, result.error);
		}

		return res.json(result);
	} catch (error) {
		return next(error);
	}
});

export default router;
