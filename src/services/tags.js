import prisma from "../db/prisma.js";
import { findAccessibleBaby } from "./babyAccess.js";

export const DEFAULT_TAG_COLOR = "#94A3B8";
const DEFAULT_TAG_TYPE = "custom";

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

function normalizeTagInput(input) {
	return {
		type: input.type ?? DEFAULT_TAG_TYPE,
		name: input.name,
		color: input.color ?? DEFAULT_TAG_COLOR,
	};
}

function normalizeComparable(value) {
	return value.trim().toLocaleLowerCase();
}

function sortTags(tags, search) {
	const normalizedSearch = search ? normalizeComparable(search) : null;

	return [...tags].sort((left, right) => {
		const leftName = normalizeComparable(left.name);
		const rightName = normalizeComparable(right.name);
		const leftExact = normalizedSearch && leftName === normalizedSearch ? 0 : 1;
		const rightExact = normalizedSearch && rightName === normalizedSearch ? 0 : 1;

		if (leftExact !== rightExact) {
			return leftExact - rightExact;
		}

		const leftScope = left.babyId ? 0 : 1;
		const rightScope = right.babyId ? 0 : 1;

		if (leftScope !== rightScope) {
			return leftScope - rightScope;
		}

		return left.name.localeCompare(right.name);
	});
}

async function findDuplicateTag(client, babyId, input, excludedId = null) {
	return client.tag.findFirst({
		where: {
			babyId,
			type: {
				equals: input.type,
				mode: "insensitive",
			},
			name: {
				equals: input.name,
				mode: "insensitive",
			},
			...(excludedId ? { id: { not: excludedId } } : {}),
		},
	});
}

function isUniqueConstraintError(error) {
	return error?.code === "P2002";
}

export async function listTagsForUser(userId, babyId, input = {}) {
	const baby = await findAccessibleBaby(userId, babyId);

	if (!baby) {
		return { error: "BABY_NOT_FOUND" };
	}

	const where = {
		OR: [{ babyId }, { babyId: null }],
		...(input.search
			? {
					name: {
						contains: input.search,
						mode: "insensitive",
					},
				}
			: {}),
	};

	const tags = await prisma.tag.findMany({ where });

	return {
		tags: sortTags(tags, input.search).map(serializeTag),
	};
}

export async function createTagForUser(userId, babyId, input) {
	const baby = await findAccessibleBaby(userId, babyId);

	if (!baby) {
		return { error: "BABY_NOT_FOUND" };
	}

	const data = normalizeTagInput(input);
	const duplicate = await findDuplicateTag(prisma, babyId, data);

	if (duplicate) {
		return { error: "TAG_EXISTS" };
	}

	try {
		const tag = await prisma.tag.create({
			data: {
				...data,
				babyId,
			},
		});

		return { tag: serializeTag(tag) };
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			return { error: "TAG_EXISTS" };
		}

		throw error;
	}
}

export async function updateTagForUser(userId, babyId, tagId, input) {
	const baby = await findAccessibleBaby(userId, babyId);

	if (!baby) {
		return { error: "BABY_NOT_FOUND" };
	}

	const existing = await prisma.tag.findUnique({
		where: { id: tagId },
	});

	if (!existing) {
		return { error: "TAG_NOT_FOUND" };
	}

	if (!existing.babyId) {
		return { error: "GLOBAL_TAG_READ_ONLY" };
	}

	if (existing.babyId !== babyId) {
		return { error: "TAG_NOT_FOUND" };
	}

	const data = {
		type: input.type ?? existing.type,
		name: input.name ?? existing.name,
		color: input.color ?? existing.color,
	};

	const duplicate = await findDuplicateTag(prisma, babyId, data, tagId);

	if (duplicate) {
		return { error: "TAG_EXISTS" };
	}

	try {
		const tag = await prisma.tag.update({
			where: { id: tagId },
			data,
		});

		return { tag: serializeTag(tag) };
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			return { error: "TAG_EXISTS" };
		}

		throw error;
	}
}

export async function deleteTagForUser(userId, babyId, tagId) {
	const baby = await findAccessibleBaby(userId, babyId);

	if (!baby) {
		return { error: "BABY_NOT_FOUND" };
	}

	const existing = await prisma.tag.findUnique({
		where: { id: tagId },
	});

	if (!existing) {
		return { error: "TAG_NOT_FOUND" };
	}

	if (!existing.babyId) {
		return { error: "GLOBAL_TAG_READ_ONLY" };
	}

	if (existing.babyId !== babyId) {
		return { error: "TAG_NOT_FOUND" };
	}

	await prisma.tag.delete({
		where: { id: tagId },
	});

	return { deleted: true };
}
