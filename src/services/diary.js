import prisma from "../db/prisma.js";
import { findAccessibleBaby } from "./babyAccess.js";

const DEFAULT_DIARY_LIST_LIMIT = 30;

const diaryInclude = {
	media: {
		orderBy: { id: "asc" },
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
};

function dateOnly(value) {
	return new Date(`${value}T00:00:00.000Z`);
}

function dateString(value) {
	return value.toISOString().slice(0, 10);
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

function serializeMedia(media) {
	return {
		id: media.id,
		diaryId: media.diaryId,
		fileType: media.fileType,
		description: media.description,
		objectKey: media.objectKey,
		sizeBytes: media.sizeBytes,
	};
}

function serializeDiaryEntry(entry) {
	return {
		id: entry.id,
		babyId: entry.babyId,
		content: entry.content,
		diaryDate: dateString(entry.diaryDate),
		createdById: entry.createdById,
		updatedById: entry.updatedById,
		createdAt: entry.createdAt.toISOString(),
		updatedAt: entry.updatedAt.toISOString(),
		media: entry.media.map(serializeMedia),
		tags: entry.tags.map((row) => serializeTag(row.tag)),
	};
}

function normalizeMediaInput(media = []) {
	return media.map((item) => ({
		fileType: item.fileType,
		description: item.description ?? null,
		objectKey: item.objectKey,
		sizeBytes: item.sizeBytes,
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

	const entries = await prisma.diaryEntry.findMany({
		where: {
			babyId,
			...(input.endDate
				? {
						diaryDate: { lte: dateOnly(input.endDate) },
					}
				: {}),
		},
		include: diaryInclude,
		orderBy: [{ diaryDate: "desc" }, { createdAt: "desc" }],
		take: input.take ?? DEFAULT_DIARY_LIST_LIMIT,
	});

	return {
		diaryEntries: entries.map(serializeDiaryEntry),
	};
}

export async function createDiaryEntryForUser(userId, babyId, input) {
	if (hasDuplicateObjectKeys(input.media)) {
		return { error: "DIARY_MEDIA_OBJECT_KEY_EXISTS" };
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

			return { diaryEntry: serializeDiaryEntry(entry) };
		});
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			return { error: "DIARY_MEDIA_OBJECT_KEY_EXISTS" };
		}

		throw error;
	}
}

export async function updateDiaryEntryForUser(userId, babyId, diaryId, input) {
	if (input.media && hasDuplicateObjectKeys(input.media)) {
		return { error: "DIARY_MEDIA_OBJECT_KEY_EXISTS" };
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

			return { diaryEntry: serializeDiaryEntry(entry) };
		});
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			return { error: "DIARY_MEDIA_OBJECT_KEY_EXISTS" };
		}

		throw error;
	}
}

export async function deleteDiaryEntryForUser(userId, babyId, diaryId) {
	return prisma.$transaction(async (tx) => {
		const baby = await findAccessibleBaby(userId, babyId, tx);

		if (!baby) {
			return { error: "BABY_NOT_FOUND" };
		}

		const existing = await findAccessibleDiaryEntry(tx, babyId, diaryId);

		if (!existing) {
			return { error: "DIARY_ENTRY_NOT_FOUND" };
		}

		await tx.diaryEntry.delete({
			where: { id: diaryId },
		});

		return { deleted: true };
	});
}
