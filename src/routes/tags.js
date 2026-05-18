import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/requireAuth.js";
import { sendError } from "../http/errors.js";
import { parseBody, parseParams, parseQuery } from "../http/validation.js";
import {
	DEFAULT_TAG_COLOR,
	createTagForUser,
	deleteTagForUser,
	listTagsForUser,
	updateTagForUser,
} from "../services/tags.js";

const router = Router({ mergeParams: true });

const babyParamsSchema = z.object({
	babyId: z.uuid(),
});

const tagParamsSchema = babyParamsSchema.extend({
	tagId: z.uuid(),
});

const MAX_TAG_NAME_LENGTH = 30;
const tagNameSchema = z.string().trim().min(1, "Tag name is required.").max(
	MAX_TAG_NAME_LENGTH,
	`Tag names must be ${MAX_TAG_NAME_LENGTH} characters or fewer.`,
);
const tagTypeSchema = z.string().trim().min(1).max(40);
const tagColorSchema = z.string().trim().min(1).max(32);

const listTagsQuerySchema = z.object({
	search: z.string().trim().max(80).optional(),
});

const createTagBodySchema = z.object({
	name: tagNameSchema,
	type: tagTypeSchema.default("custom"),
	color: tagColorSchema.default(DEFAULT_TAG_COLOR),
});

const updateTagBodySchema = z
	.object({
		name: tagNameSchema.optional(),
		type: tagTypeSchema.optional(),
		color: tagColorSchema.optional(),
	})
	.refine(
		(value) =>
			value.name !== undefined ||
			value.type !== undefined ||
			value.color !== undefined,
		{
			message: "At least one tag field is required.",
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

function sendTagServiceError(res, code) {
	if (code === "BABY_NOT_FOUND") {
		return sendError(
			res,
			404,
			"BABY_NOT_FOUND",
			"Baby was not found for the current user.",
		);
	}

	if (code === "TAG_EXISTS") {
		return sendError(
			res,
			409,
			"TAG_EXISTS",
			"A tag with this type and name already exists for this baby.",
		);
	}

	if (code === "GLOBAL_TAG_READ_ONLY") {
		return sendError(
			res,
			403,
			"GLOBAL_TAG_READ_ONLY",
			"Default tags cannot be modified.",
		);
	}

	return sendError(
		res,
		404,
		"TAG_NOT_FOUND",
		"Tag was not found for the current baby.",
	);
}

router.use(requireAuth);

router.get("/", async (req, res, next) => {
	try {
		const parsedParams = parseParams(babyParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const parsedQuery = parseQuery(listTagsQuerySchema, req.query);

		if (parsedQuery.error) {
			return sendParsedError(res, parsedQuery);
		}

		const result = await listTagsForUser(
			req.user.id,
			parsedParams.data.babyId,
			parsedQuery.data,
		);

		if (result.error) {
			return sendTagServiceError(res, result.error);
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

		const parsedBody = parseBody(createTagBodySchema, req.body);

		if (parsedBody.error) {
			return sendParsedError(res, parsedBody);
		}

		const result = await createTagForUser(
			req.user.id,
			parsedParams.data.babyId,
			parsedBody.data,
		);

		if (result.error) {
			return sendTagServiceError(res, result.error);
		}

		return res.status(201).json(result);
	} catch (error) {
		return next(error);
	}
});

router.patch("/:tagId", async (req, res, next) => {
	try {
		const parsedParams = parseParams(tagParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const parsedBody = parseBody(updateTagBodySchema, req.body);

		if (parsedBody.error) {
			return sendParsedError(res, parsedBody);
		}

		const result = await updateTagForUser(
			req.user.id,
			parsedParams.data.babyId,
			parsedParams.data.tagId,
			parsedBody.data,
		);

		if (result.error) {
			return sendTagServiceError(res, result.error);
		}

		return res.json(result);
	} catch (error) {
		return next(error);
	}
});

router.delete("/:tagId", async (req, res, next) => {
	try {
		const parsedParams = parseParams(tagParamsSchema, req.params);

		if (parsedParams.error) {
			return sendParsedError(res, parsedParams);
		}

		const result = await deleteTagForUser(
			req.user.id,
			parsedParams.data.babyId,
			parsedParams.data.tagId,
		);

		if (result.error) {
			return sendTagServiceError(res, result.error);
		}

		return res.status(204).send();
	} catch (error) {
		return next(error);
	}
});

export default router;
