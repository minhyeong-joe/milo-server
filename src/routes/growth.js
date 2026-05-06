import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/requireAuth.js";
import { sendError } from "../http/errors.js";
import { parseBody, parseParams } from "../http/validation.js";
import {
	createGrowthRecordForUser,
	deleteGrowthRecordForUser,
	listGrowthRecordsForUser,
	updateGrowthRecordForUser,
} from "../services/growth.js";

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

const dateStringSchema = z.string().refine(isValidDateString, "Must be a valid YYYY-MM-DD date.");
const measurementSchema = z.number().int().positive().optional();
const notesSchema = z.string().trim().max(200).optional();

const babyParamsSchema = z.object({
	babyId: z.uuid(),
});

const growthParamsSchema = babyParamsSchema.extend({
	growthId: z.uuid(),
});

const growthRecordBodySchema = z
	.object({
		measuredDate: dateStringSchema,
		heightMm: measurementSchema,
		weightGrams: measurementSchema,
		headCircumferenceMm: measurementSchema,
		notes: notesSchema,
	})
	.superRefine((value, ctx) => {
		if (
			value.heightMm === undefined &&
			value.weightGrams === undefined &&
			value.headCircumferenceMm === undefined
		) {
			ctx.addIssue({
				code: "custom",
				path: ["heightMm"],
				message: "At least one measurement is required.",
			});
		}
	});

function sendParsedError(res, parsed) {
	return sendError(
		res,
		400,
		parsed.error.code,
		parsed.error.message,
		parsed.error.details,
	);
}

function sendGrowthServiceError(res, code) {
	if (code === "BABY_NOT_FOUND") {
		return sendError(
			res,
			404,
			"BABY_NOT_FOUND",
			"Baby was not found for the current user.",
		);
	}

	if (code === "GROWTH_RECORD_DATE_EXISTS") {
		return sendError(
			res,
			409,
			"GROWTH_RECORD_DATE_EXISTS",
			"A growth record already exists for this date.",
		);
	}

	return sendError(
		res,
		404,
		"GROWTH_RECORD_NOT_FOUND",
		"Growth record was not found for the current baby.",
	);
}

router.use(requireAuth);

router.get("/", async (req, res, next) => {
	try {
		const parsedParams = parseParams(babyParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const result = await listGrowthRecordsForUser(
			req.user.id,
			parsedParams.data.babyId,
		);

		if (result.error) {
			return sendGrowthServiceError(res, result.error);
		}

		return res.json(result);
	} catch (error) {
		return next(error);
	}
});

router.post("/", async (req, res, next) => {
	try {
		const parsedParams = parseParams(babyParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const parsedBody = parseBody(growthRecordBodySchema, req.body);

		if (parsedBody.error) {
			return sendParsedError(res, parsedBody);
		}

		const result = await createGrowthRecordForUser(
			req.user.id,
			parsedParams.data.babyId,
			parsedBody.data,
		);

		if (result.error) {
			return sendGrowthServiceError(res, result.error);
		}

		return res.status(201).json(result);
	} catch (error) {
		return next(error);
	}
});

router.patch("/:growthId", async (req, res, next) => {
	try {
		const parsedParams = parseParams(growthParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const parsedBody = parseBody(growthRecordBodySchema, req.body);

		if (parsedBody.error) {
			return sendParsedError(res, parsedBody);
		}

		const { babyId, growthId } = parsedParams.data;
		const result = await updateGrowthRecordForUser(
			req.user.id,
			babyId,
			growthId,
			parsedBody.data,
		);

		if (result.error) {
			return sendGrowthServiceError(res, result.error);
		}

		return res.json(result);
	} catch (error) {
		return next(error);
	}
});

router.delete("/:growthId", async (req, res, next) => {
	try {
		const parsedParams = parseParams(growthParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const { babyId, growthId } = parsedParams.data;
		const result = await deleteGrowthRecordForUser(req.user.id, babyId, growthId);

		if (result.error) {
			return sendGrowthServiceError(res, result.error);
		}

		return res.status(204).send();
	} catch (error) {
		return next(error);
	}
});

export default router;
