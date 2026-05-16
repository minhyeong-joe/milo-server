import { randomUUID } from "node:crypto";
import prisma from "../db/prisma.js";
import { findAccessibleBaby } from "./babyAccess.js";
import {
	S3_PRESIGNED_GET_EXPIRES_IN_SECONDS,
	S3_PRESIGNED_PUT_EXPIRES_IN_SECONDS,
	createPresignedGetUrl,
	createPresignedPutUrl,
	deleteS3Object,
} from "../storage/s3.js";

const DEFAULT_DIARY_LIST_LIMIT = 30;
export const DIARY_MEDIA_LIMITS = {
	MAX_PHOTOS: 10,
	MAX_VIDEOS: 3,
	MAX_PHOTO_SIZE_BYTES: 8 * 1024 * 1024,
	MAX_VIDEO_SIZE_BYTES: 30 * 1024 * 1024,
	MAX_TOTAL_SIZE_BYTES: 100 * 1024 * 1024,
};
const DIARY_MEDIA_CONTENT_TYPES = new Map([
	["image/jpeg", { extension: "jpg", kind: "photo" }],
	["image/png", { extension: "png", kind: "photo" }],
	["image/webp", { extension: "webp", kind: "photo" }],
	["video/mp4", { extension: "mp4", kind: "video" }],
	["video/quicktime", { extension: "mov", kind: "video" }],
]);

const DIARY_ORDER_BY = [
	{ diaryDate: "desc" },
	{ createdAt: "desc" },
	{ id: "desc" },
];

const diaryInclude = {
	createdBy: {
		select: {
			id: true,
			displayName: true,
			email: true,
		},
	},
	media: {
		orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
	},
	tags: {
		include: {
			tag: true,
		},
		orderBy: {
			tag: {
				name: "asc",
			},
		},
	},
	updatedBy: {
		select: {
			id: true,
			displayName: true,
			email: true,
		},
	},
};

function dateOnly(value) {
	return new Date(`${value}T00:00:00.000Z`);
}

function dateString(value) {
	return value.toISOString().slice(0, 10);
}

function normalizeTitle(value) {
	if (value === undefined) {
		return undefined;
	}

	const trimmed = value?.trim() ?? "";
	return trimmed.length > 0 ? trimmed : null;
}

function isValidDateString(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}

	const date = dateOnly(value);

	return !Number.isNaN(date.getTime()) && dateString(date) === value;
}

function encodeDiaryCursor(entry) {
	const payload = JSON.stringify({
		createdAt: entry.createdAt.toISOString(),
		diaryDate: dateString(entry.diaryDate),
		id: entry.id,
	});

	return Buffer.from(payload, "utf8").toString("base64url");
}

function decodeDiaryCursor(cursor) {
	try {
		const decoded = Buffer.from(cursor, "base64url").toString("utf8");
		const payload = JSON.parse(decoded);

		if (
			typeof payload !== "object" ||
			payload === null ||
			typeof payload.diaryDate !== "string" ||
			typeof payload.createdAt !== "string" ||
			typeof payload.id !== "string" ||
			!isValidDateString(payload.diaryDate)
		) {
			return null;
		}

		const createdAt = new Date(payload.createdAt);

		if (Number.isNaN(createdAt.getTime())) {
			return null;
		}

		return {
			createdAt,
			diaryDate: dateOnly(payload.diaryDate),
			id: payload.id,
		};
	} catch {
		return null;
	}
}

function getCursorWhere(cursor) {
	return {
		OR: [
			{ diaryDate: { lt: cursor.diaryDate } },
			{
				AND: [
					{ diaryDate: cursor.diaryDate },
					{ createdAt: { lt: cursor.createdAt } },
				],
			},
			{
				AND: [
					{ diaryDate: cursor.diaryDate },
					{ createdAt: cursor.createdAt },
					{ id: { lt: cursor.id } },
				],
			},
		],
	};
}

function getDiaryListWhere(babyId, input, cursor) {
	const andFilters = [{ babyId }];

	if (cursor) {
		andFilters.push(getCursorWhere(cursor));
	} else {
		const diaryDate = {};

		if (input.startDate) {
			diaryDate.gte = dateOnly(input.startDate);
		}

		if (input.endDate) {
			diaryDate.lte = dateOnly(input.endDate);
		}

		if (Object.keys(diaryDate).length > 0) {
			andFilters.push({ diaryDate });
		}
	}

	if (input.search) {
		const search = input.search.trim();

		if (search) {
			andFilters.push({
				OR: [
					{ title: { contains: search, mode: "insensitive" } },
					{ content: { contains: search, mode: "insensitive" } },
				],
			});
		}
	}

	if (input.includeMedia === true) {
		andFilters.push({ media: { some: {} } });
	}

	if (input.includeMedia === false) {
		andFilters.push({ media: { none: {} } });
	}

	if (input.tagIds?.length > 0) {
		andFilters.push({
			tags: {
				some: {
					tagId: { in: input.tagIds },
				},
			},
		});
	}

	if (input.tagTypes?.length > 0) {
		const tagTypeFilters = buildTagTypeFilters(babyId, input.tagTypes);

		if (tagTypeFilters.length > 0) {
			andFilters.push({
				tags: {
					some: {
						tag: {
							OR: tagTypeFilters,
						},
					},
				},
			});
		}
	}

	return { AND: andFilters };
}

function buildTagTypeFilters(babyId, tagTypes) {
	const normalizedTypes = uniqueValues(
		tagTypes
			.map((type) => type.trim().toLowerCase())
			.filter(Boolean),
	);
	const filters = [];
	const defaultTypes = normalizedTypes.filter((type) => type !== "custom");

	if (defaultTypes.length > 0) {
		filters.push({
			type: { in: defaultTypes },
		});
	}

	if (normalizedTypes.includes("custom")) {
		filters.push({
			babyId,
		});
	}

	return filters;
}

function serializeTag(tag) {
	return {
		id: tag.id,
		babyId: tag.babyId,
		type: tag.type,
		name: tag.name,
		color: tag.color,
		scope: tag.babyId ? "custom" : "global",
		createdAt: tag.createdAt.toISOString(),
		updatedAt: tag.updatedAt.toISOString(),
	};
}

async function serializeMedia(media) {
	const getUrlExpiresAt = new Date(
		Date.now() + S3_PRESIGNED_GET_EXPIRES_IN_SECONDS * 1000,
	).toISOString();

	return {
		id: media.id,
		diaryId: media.diaryId,
		fileType: media.fileType,
		description: media.description,
		objectKey: media.objectKey,
		sizeBytes: media.sizeBytes,
		sortOrder: media.sortOrder,
		thumbnailObjectKey: media.thumbnailObjectKey,
		thumbnailFileType: media.thumbnailFileType,
		thumbnailSizeBytes: media.thumbnailSizeBytes,
		mediaUrl: media.objectKey
			? await createPresignedGetUrl({ objectKey: media.objectKey })
			: null,
		mediaUrlExpiresAt: media.objectKey ? getUrlExpiresAt : null,
		thumbnailUrl: media.thumbnailObjectKey
			? await createPresignedGetUrl({ objectKey: media.thumbnailObjectKey })
			: null,
		thumbnailUrlExpiresAt: media.thumbnailObjectKey ? getUrlExpiresAt : null,
	};
}

function serializeUser(user) {
	if (!user) {
		return null;
	}

	return {
		id: user.id,
		displayName: user.displayName,
		email: user.email,
	};
}

async function serializeDiaryEntry(entry) {
	return {
		id: entry.id,
		babyId: entry.babyId,
		title: entry.title,
		content: entry.content,
		diaryDate: dateString(entry.diaryDate),
		createdById: entry.createdById,
		updatedById: entry.updatedById,
		createdBy: serializeUser(entry.createdBy),
		updatedBy: serializeUser(entry.updatedBy),
		createdAt: entry.createdAt.toISOString(),
		updatedAt: entry.updatedAt.toISOString(),
		media: await Promise.all(entry.media.map(serializeMedia)),
		tags: entry.tags.map((row) => serializeTag(row.tag)),
	};
}

function normalizeMediaInput(media = []) {
	return media.map((item, index) => ({
		fileType: item.fileType,
		description: item.description ?? null,
		objectKey: item.objectKey,
		sizeBytes: item.sizeBytes,
		sortOrder: item.sortOrder ?? index,
		thumbnailObjectKey: item.thumbnailObjectKey ?? null,
		thumbnailFileType: item.thumbnailFileType ?? null,
		thumbnailSizeBytes: item.thumbnailSizeBytes ?? null,
	}));
}

function uniqueValues(values) {
	return [...new Set(values)];
}

function getDailyLimit() {
	const rawLimit = Number.parseInt(process.env.DIARY_ENTRIES_PER_DAY_LIMIT ?? "0", 10);

	if (!Number.isFinite(rawLimit) || rawLimit <= 0) {
		return null;
	}

	return rawLimit;
}

function hasDuplicateObjectKeys(media = []) {
	const objectKeys = media.map((item) => item.objectKey);
	return new Set(objectKeys).size !== objectKeys.length;
}

function diaryMediaObjectKeyPrefix(babyId) {
	return `babies/${babyId}/diary-media/`;
}

function createDiaryMediaObjectKey(babyId, fileType, uploadPurpose = "media") {
	const contentType = DIARY_MEDIA_CONTENT_TYPES.get(fileType);
	const suffix = uploadPurpose === "thumbnail" ? "-thumb" : "";
	return `${diaryMediaObjectKeyPrefix(babyId)}${randomUUID()}${suffix}.${contentType.extension}`;
}

function isValidDiaryMediaObjectKey(babyId, objectKey) {
	return objectKey.startsWith(diaryMediaObjectKeyPrefix(babyId));
}

function getMediaKind(fileType) {
	return DIARY_MEDIA_CONTENT_TYPES.get(fileType)?.kind ?? null;
}

function validateDiaryMediaUploadInput(input) {
	const kind = getMediaKind(input.fileType);

	if (!kind) {
		return "INVALID_DIARY_MEDIA_TYPE";
	}

	if (input.uploadPurpose === "thumbnail" && kind !== "photo") {
		return "INVALID_DIARY_MEDIA_TYPE";
	}

	if (
		kind === "photo" &&
		input.sizeBytes > DIARY_MEDIA_LIMITS.MAX_PHOTO_SIZE_BYTES
	) {
		return "DIARY_MEDIA_FILE_TOO_LARGE";
	}

	if (
		kind === "video" &&
		input.sizeBytes > DIARY_MEDIA_LIMITS.MAX_VIDEO_SIZE_BYTES
	) {
		return "DIARY_MEDIA_FILE_TOO_LARGE";
	}

	return null;
}

function validateDiaryMediaInput(babyId, media = []) {
	if (hasDuplicateObjectKeys(media)) {
		return "DIARY_MEDIA_OBJECT_KEY_EXISTS";
	}

	let photoCount = 0;
	let videoCount = 0;
	let totalSizeBytes = 0;

	for (const item of media) {
		const validationError = validateDiaryMediaUploadInput(item);

		if (validationError) {
			return validationError;
		}

		if (!isValidDiaryMediaObjectKey(babyId, item.objectKey)) {
			return "INVALID_DIARY_MEDIA_OBJECT_KEY";
		}

		if (item.thumbnailObjectKey) {
			if (!isValidDiaryMediaObjectKey(babyId, item.thumbnailObjectKey)) {
				return "INVALID_DIARY_MEDIA_OBJECT_KEY";
			}

			if (
				!item.thumbnailFileType ||
				getMediaKind(item.thumbnailFileType) !== "photo"
			) {
				return "INVALID_DIARY_MEDIA_TYPE";
			}

			if (
				item.thumbnailSizeBytes !== undefined &&
				item.thumbnailSizeBytes !== null &&
				item.thumbnailSizeBytes > DIARY_MEDIA_LIMITS.MAX_PHOTO_SIZE_BYTES
			) {
				return "DIARY_MEDIA_FILE_TOO_LARGE";
			}
		}

		const kind = getMediaKind(item.fileType);
		totalSizeBytes += item.sizeBytes;

		if (kind === "photo") {
			photoCount += 1;
		}

		if (kind === "video") {
			videoCount += 1;
		}
	}

	if (
		photoCount > DIARY_MEDIA_LIMITS.MAX_PHOTOS ||
		videoCount > DIARY_MEDIA_LIMITS.MAX_VIDEOS
	) {
		return "DIARY_MEDIA_COUNT_LIMIT";
	}

	if (totalSizeBytes > DIARY_MEDIA_LIMITS.MAX_TOTAL_SIZE_BYTES) {
		return "DIARY_MEDIA_TOTAL_SIZE_LIMIT";
	}

	return null;
}

function isUniqueConstraintError(error) {
	return error?.code === "P2002";
}

async function assertDiaryDailyLimit(client, babyId, diaryDate, excludedId = null) {
	const limit = getDailyLimit();

	if (!limit) {
		return true;
	}

	const count = await client.diaryEntry.count({
		where: {
			babyId,
			diaryDate,
			...(excludedId ? { id: { not: excludedId } } : {}),
		},
	});

	return count < limit;
}

async function findAccessibleDiaryEntry(client, babyId, diaryId) {
	return client.diaryEntry.findFirst({
		where: {
			id: diaryId,
			babyId,
		},
	});
}

async function validateTags(client, babyId, tagIds = []) {
	const uniqueTagIds = uniqueValues(tagIds);

	if (uniqueTagIds.length === 0) {
		return { tagIds: [] };
	}

	const tags = await client.tag.findMany({
		where: {
			id: { in: uniqueTagIds },
			OR: [{ babyId }, { babyId: null }],
		},
		select: { id: true },
	});

	if (tags.length !== uniqueTagIds.length) {
		return { error: "DIARY_TAG_NOT_FOUND" };
	}

	return { tagIds: uniqueTagIds };
}

async function fetchDiaryEntry(client, diaryId) {
	return client.diaryEntry.findUnique({
		where: { id: diaryId },
		include: diaryInclude,
	});
}

export async function listDiaryEntriesForUser(userId, babyId, input = {}) {
	const baby = await findAccessibleBaby(userId, babyId);

	if (!baby) {
		return { error: "BABY_NOT_FOUND" };
	}

	const cursor = input.cursor ? decodeDiaryCursor(input.cursor) : null;

	if (input.cursor && !cursor) {
		return { error: "INVALID_DIARY_CURSOR" };
	}

	const take = input.take ?? DEFAULT_DIARY_LIST_LIMIT;

	const entries = await prisma.diaryEntry.findMany({
		where: getDiaryListWhere(babyId, input, cursor),
		include: diaryInclude,
		orderBy: DIARY_ORDER_BY,
		take: take + 1,
	});
	const pageEntries = entries.slice(0, take);
	const nextCursor = entries.length > take
		? encodeDiaryCursor(pageEntries[pageEntries.length - 1])
		: null;

	return {
		diaryEntries: await Promise.all(pageEntries.map(serializeDiaryEntry)),
		nextCursor,
	};
}

export async function createDiaryMediaUploadForUser(userId, babyId, input) {
	const validationError = validateDiaryMediaUploadInput(input);

	if (validationError) {
		return { error: validationError };
	}

	const baby = await findAccessibleBaby(userId, babyId);

	if (!baby) {
		return { error: "BABY_NOT_FOUND" };
	}

	const objectKey = createDiaryMediaObjectKey(
		babyId,
		input.fileType,
		input.uploadPurpose,
	);
	const uploadUrl = await createPresignedPutUrl({
		contentType: input.fileType,
		objectKey,
	});

	return {
		objectKey,
		uploadUrl,
		expiresIn: S3_PRESIGNED_PUT_EXPIRES_IN_SECONDS,
	};
}

export async function removeDiaryMediaUploadForUser(userId, babyId, input) {
	const baby = await findAccessibleBaby(userId, babyId);

	if (!baby) {
		return { error: "BABY_NOT_FOUND" };
	}

	if (!isValidDiaryMediaObjectKey(babyId, input.objectKey)) {
		return { error: "INVALID_DIARY_MEDIA_OBJECT_KEY" };
	}

	try {
		await deleteS3Object({ objectKey: input.objectKey });
	} catch (error) {
		console.warn("Failed to delete diary media object from S3.", error);
	}

	return { deleted: true };
}

export async function createDiaryEntryForUser(userId, babyId, input) {
	const mediaValidationError = validateDiaryMediaInput(babyId, input.media);

	if (mediaValidationError) {
		return { error: mediaValidationError };
	}

	try {
		return await prisma.$transaction(async (tx) => {
			const baby = await findAccessibleBaby(userId, babyId, tx);

			if (!baby) {
				return { error: "BABY_NOT_FOUND" };
			}

			const diaryDate = dateOnly(input.diaryDate);
			const withinLimit = await assertDiaryDailyLimit(tx, babyId, diaryDate);

			if (!withinLimit) {
				return { error: "DIARY_ENTRY_DAILY_LIMIT" };
			}

			const tagValidation = await validateTags(tx, babyId, input.tagIds ?? []);

			if (tagValidation.error) {
				return tagValidation;
			}

			const entry = await tx.diaryEntry.create({
				data: {
					babyId,
					title: normalizeTitle(input.title) ?? null,
					content: input.content,
					diaryDate,
					createdById: userId,
					updatedById: userId,
					media: {
						create: normalizeMediaInput(input.media),
					},
					tags: {
						create: tagValidation.tagIds.map((tagId) => ({ tagId })),
					},
				},
				include: diaryInclude,
			});

			return { diaryEntry: await serializeDiaryEntry(entry) };
		});
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			return { error: "DIARY_MEDIA_OBJECT_KEY_EXISTS" };
		}

		throw error;
	}
}

export async function updateDiaryEntryForUser(userId, babyId, diaryId, input) {
	if (input.media) {
		const mediaValidationError = validateDiaryMediaInput(babyId, input.media);

		if (mediaValidationError) {
			return { error: mediaValidationError };
		}
	}

	try {
		return await prisma.$transaction(async (tx) => {
			const baby = await findAccessibleBaby(userId, babyId, tx);

			if (!baby) {
				return { error: "BABY_NOT_FOUND" };
			}

			const existing = await findAccessibleDiaryEntry(tx, babyId, diaryId);

			if (!existing) {
				return { error: "DIARY_ENTRY_NOT_FOUND" };
			}

			const nextDiaryDate = input.diaryDate ? dateOnly(input.diaryDate) : existing.diaryDate;

			if (input.diaryDate) {
				const withinLimit = await assertDiaryDailyLimit(
					tx,
					babyId,
					nextDiaryDate,
					diaryId,
				);

				if (!withinLimit) {
					return { error: "DIARY_ENTRY_DAILY_LIMIT" };
				}
			}

			const tagValidation =
				input.tagIds === undefined
					? { tagIds: null }
					: await validateTags(tx, babyId, input.tagIds);

			if (tagValidation.error) {
				return tagValidation;
			}

			await tx.diaryEntry.update({
				where: { id: diaryId },
				data: {
					...(input.title !== undefined ? { title: normalizeTitle(input.title) } : {}),
					...(input.content !== undefined ? { content: input.content } : {}),
					...(input.diaryDate !== undefined ? { diaryDate: nextDiaryDate } : {}),
					updatedById: userId,
				},
			});

			if (input.media !== undefined) {
				await tx.diaryMedia.deleteMany({
					where: { diaryId },
				});

				const media = normalizeMediaInput(input.media);

				if (media.length > 0) {
					await tx.diaryMedia.createMany({
						data: media.map((item) => ({
							...item,
							diaryId,
						})),
					});
				}
			}

			if (tagValidation.tagIds) {
				await tx.diaryTag.deleteMany({
					where: { diaryId },
				});

				if (tagValidation.tagIds.length > 0) {
					await tx.diaryTag.createMany({
						data: tagValidation.tagIds.map((tagId) => ({
							diaryId,
							tagId,
						})),
					});
				}
			}

			const entry = await fetchDiaryEntry(tx, diaryId);

			return { diaryEntry: await serializeDiaryEntry(entry) };
		});
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			return { error: "DIARY_MEDIA_OBJECT_KEY_EXISTS" };
		}

		throw error;
	}
}

export async function deleteDiaryEntryForUser(userId, babyId, diaryId) {
	const result = await prisma.$transaction(async (tx) => {
		const baby = await findAccessibleBaby(userId, babyId, tx);

		if (!baby) {
			return { error: "BABY_NOT_FOUND" };
		}

		const existing = await findAccessibleDiaryEntry(tx, babyId, diaryId);

		if (!existing) {
			return { error: "DIARY_ENTRY_NOT_FOUND" };
		}

		const media = await tx.diaryMedia.findMany({
			where: { diaryId },
			select: {
				objectKey: true,
				thumbnailObjectKey: true,
			},
		});

		await tx.diaryEntry.delete({
			where: { id: diaryId },
		});

		return {
			deleted: true,
			deletedObjectKeys: media.flatMap((item) =>
				[item.objectKey, item.thumbnailObjectKey].filter(Boolean),
			),
		};
	});

	if (result.deletedObjectKeys) {
		await Promise.all(
			result.deletedObjectKeys.map(async (objectKey) => {
				try {
					await deleteS3Object({ objectKey });
				} catch (error) {
					console.warn("Failed to delete diary media object from S3.", error);
				}
			}),
		);
	}

	return result.error ? result : { deleted: true };
}
