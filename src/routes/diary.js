import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/requireAuth.js";
import { sendError } from "../http/errors.js";
import { parseBody, parseParams, parseQuery } from "../http/validation.js";
import {
	createDiaryEntryForUser,
	createDiaryMediaUploadForUser,
	deleteDiaryEntryForUser,
	listDiaryEntriesForUser,
	removeDiaryMediaUploadForUser,
	updateDiaryEntryForUser,
} from "../services/diary.js";

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
const contentSchema = z.string().trim().min(1).max(500);
const titleSchema = z.string().trim().max(80).nullable();
const mediaSchema = z.object({
	fileType: z.string().trim().min(1).max(80),
	description: z.string().trim().max(200).nullable().optional(),
	objectKey: z.string().trim().min(1).max(500),
	sizeBytes: z.number().int().nonnegative(),
	sortOrder: z.number().int().nonnegative().optional(),
	thumbnailObjectKey: z.string().trim().min(1).max(500).nullable().optional(),
	thumbnailFileType: z.string().trim().min(1).max(80).nullable().optional(),
	thumbnailSizeBytes: z.number().int().nonnegative().nullable().optional(),
});
const mediaUploadSchema = z.object({
	fileType: z.string().trim().min(1).max(80),
	sizeBytes: z.number().int().nonnegative(),
	uploadPurpose: z.enum(["media", "thumbnail"]).default("media"),
});
const mediaDeleteSchema = z.object({
	objectKey: z.string().trim().min(1).max(500),
});

const babyParamsSchema = z.object({
	babyId: z.uuid(),
});

const diaryParamsSchema = babyParamsSchema.extend({
	diaryId: z.uuid(),
});

const listDiaryQuerySchema = z.object({
	cursor: z.string().trim().min(1).optional(),
	endDate: dateStringSchema.optional(),
	includeMedia: z.enum(["true", "false"]).optional().transform((value) =>
		value === undefined ? undefined : value === "true",
	),
	search: z.string().trim().max(120).optional(),
	startDate: dateStringSchema.optional(),
	tagIds: z.string().trim().max(2000).optional().transform(splitCsv).refine(
		(values) => values.every((value) => z.uuid().safeParse(value).success),
		"tagIds must be comma-separated UUIDs.",
	),
	tagTypes: z.string().trim().max(500).optional().transform(splitCsv),
	take: z.coerce.number().int().positive().max(100).optional(),
}).refine(
	(value) =>
		!value.startDate ||
		!value.endDate ||
		value.endDate >= value.startDate,
	{
		message: "endDate must be greater than or equal to startDate.",
		path: ["endDate"],
	},
);

function splitCsv(value) {
	if (!value) {
		return [];
	}

	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

const createDiaryBodySchema = z.object({
	content: contentSchema,
	diaryDate: dateStringSchema,
	media: z.array(mediaSchema).max(20).default([]),
	tagIds: z.array(z.uuid()).max(30).default([]),
	title: titleSchema.optional(),
});

const updateDiaryBodySchema = z
	.object({
		content: contentSchema.optional(),
		diaryDate: dateStringSchema.optional(),
		media: z.array(mediaSchema).max(20).optional(),
		tagIds: z.array(z.uuid()).max(30).optional(),
		title: titleSchema.optional(),
	})
	.refine(
		(value) =>
			value.content !== undefined ||
			value.diaryDate !== undefined ||
			value.media !== undefined ||
			value.tagIds !== undefined ||
			value.title !== undefined,
		{
			message: "At least one diary field is required.",
		},
	);

function sendParsedError(res, parsed) {
	return sendError(
		res,
		400,
		parsed.error.code,
		parsed.error.message,
		parsed.error.details,
	);
}

function sendDiaryServiceError(res, code) {
	if (code === "BABY_NOT_FOUND") {
		return sendError(
			res,
			404,
			"BABY_NOT_FOUND",
			"Baby was not found for the current user.",
		);
	}

	if (code === "DIARY_ENTRY_DAILY_LIMIT") {
		return sendError(
			res,
			409,
			"DIARY_ENTRY_DAILY_LIMIT",
			"Diary entry limit reached for this date.",
		);
	}

	if (code === "DIARY_TAG_NOT_FOUND") {
		return sendError(
			res,
			400,
			"DIARY_TAG_NOT_FOUND",
			"One or more tags were not found for this baby.",
		);
	}

	if (code === "DIARY_MEDIA_OBJECT_KEY_EXISTS") {
		return sendError(
			res,
			409,
			"DIARY_MEDIA_OBJECT_KEY_EXISTS",
			"A diary media object key already exists.",
		);
	}

	if (code === "INVALID_DIARY_MEDIA_TYPE") {
		return sendError(
			res,
			400,
			"INVALID_DIARY_MEDIA_TYPE",
			"Diary media type is not supported.",
		);
	}

	if (code === "DIARY_MEDIA_FILE_TOO_LARGE") {
		return sendError(
			res,
			400,
			"DIARY_MEDIA_FILE_TOO_LARGE",
			"Diary media file is too large.",
		);
	}

	if (code === "DIARY_MEDIA_COUNT_LIMIT") {
		return sendError(
			res,
			400,
			"DIARY_MEDIA_COUNT_LIMIT",
			"Diary media count limit was exceeded.",
		);
	}

	if (code === "DIARY_MEDIA_TOTAL_SIZE_LIMIT") {
		return sendError(
			res,
			400,
			"DIARY_MEDIA_TOTAL_SIZE_LIMIT",
			"Diary media total size limit was exceeded.",
		);
	}

	if (code === "INVALID_DIARY_MEDIA_OBJECT_KEY") {
		return sendError(
			res,
			400,
			"INVALID_DIARY_MEDIA_OBJECT_KEY",
			"Diary media object key is not valid for this baby.",
		);
	}

	if (code === "INVALID_DIARY_CURSOR") {
		return sendError(
			res,
			400,
			"INVALID_DIARY_CURSOR",
			"Diary pagination cursor is invalid.",
		);
	}

	return sendError(
		res,
		404,
		"DIARY_ENTRY_NOT_FOUND",
		"Diary entry was not found for the current baby.",
	);
}

router.use(requireAuth);

router.get("/", async (req, res, next) => {
	try {
		const parsedParams = parseParams(babyParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const parsedQuery = parseQuery(listDiaryQuerySchema, req.query);

		if (parsedQuery.error) {
			return sendParsedError(res, parsedQuery);
		}

		const result = await listDiaryEntriesForUser(
			req.user.id,
			parsedParams.data.babyId,
			parsedQuery.data,
		);

		if (result.error) {
			return sendDiaryServiceError(res, result.error);
		}

		return res.json(result);
	} catch (error) {
		return next(error);
	}
});

router.post("/media/presign-upload", async (req, res, next) => {
	try {
		const parsedParams = parseParams(babyParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const parsedBody = parseBody(mediaUploadSchema, req.body);

		if (parsedBody.error) {
			return sendParsedError(res, parsedBody);
		}

		const result = await createDiaryMediaUploadForUser(
			req.user.id,
			parsedParams.data.babyId,
			parsedBody.data,
		);

		if (result.error) {
			return sendDiaryServiceError(res, result.error);
		}

		return res.json(result);
	} catch (error) {
		return next(error);
	}
});

router.delete("/media", async (req, res, next) => {
	try {
		const parsedParams = parseParams(babyParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const parsedBody = parseBody(mediaDeleteSchema, req.body);

		if (parsedBody.error) {
			return sendParsedError(res, parsedBody);
		}

		const result = await removeDiaryMediaUploadForUser(
			req.user.id,
			parsedParams.data.babyId,
			parsedBody.data,
		);

		if (result.error) {
			return sendDiaryServiceError(res, result.error);
		}

		return res.status(204).send();
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

		const parsedBody = parseBody(createDiaryBodySchema, req.body);

		if (parsedBody.error) {
			return sendParsedError(res, parsedBody);
		}

		const result = await createDiaryEntryForUser(
			req.user.id,
			parsedParams.data.babyId,
			parsedBody.data,
		);

		if (result.error) {
			return sendDiaryServiceError(res, result.error);
		}

		return res.status(201).json(result);
	} catch (error) {
		return next(error);
	}
});

router.patch("/:diaryId", async (req, res, next) => {
	try {
		const parsedParams = parseParams(diaryParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const parsedBody = parseBody(updateDiaryBodySchema, req.body);

		if (parsedBody.error) {
			return sendParsedError(res, parsedBody);
		}

		const result = await updateDiaryEntryForUser(
			req.user.id,
			parsedParams.data.babyId,
			parsedParams.data.diaryId,
			parsedBody.data,
		);

		if (result.error) {
			return sendDiaryServiceError(res, result.error);
		}

		return res.json(result);
	} catch (error) {
		return next(error);
	}
});

router.delete("/:diaryId", async (req, res, next) => {
	try {
		const parsedParams = parseParams(diaryParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const result = await deleteDiaryEntryForUser(
			req.user.id,
			parsedParams.data.babyId,
			parsedParams.data.diaryId,
		);

		if (result.error) {
			return sendDiaryServiceError(res, result.error);
		}

		return res.status(204).send();
	} catch (error) {
		return next(error);
	}
});

export default router;
