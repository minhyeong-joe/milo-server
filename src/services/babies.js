import { randomUUID } from "node:crypto";
import prisma from "../db/prisma.js";
import { rebuildRoutineSummariesForBaby } from "./routine.js";
import {
	S3_PRESIGNED_PUT_EXPIRES_IN_SECONDS,
	createPresignedGetUrl,
	createPresignedPutUrl,
	deleteS3Object,
} from "../storage/s3.js";

const AVATAR_CONTENT_TYPES = new Map([
	["image/jpeg", "jpg"],
	["image/png", "png"],
]);
const MAX_AVATAR_SIZE_BYTES = 1 * 1024 * 1024;

async function serializeBaby(baby) {
	return {
		id: baby.id,
		name: baby.name,
		birthdate: baby.birthdate.toISOString().slice(0, 10),
		sex: baby.sex,
		timezone: baby.timezone,
		avatarObjectKey: baby.avatarObjectKey,
		avatarUrl: baby.avatarObjectKey
			? await createPresignedGetUrl({ objectKey: baby.avatarObjectKey })
			: null,
		createdAt: baby.createdAt.toISOString(),
		updatedAt: baby.updatedAt.toISOString(),
		deletedAt: baby.deletedAt ? baby.deletedAt.toISOString() : null,
	};
}

async function serializeBabyWithRole(access) {
	return {
		...(await serializeBaby(access.baby)),
		role: access.role,
	};
}

function avatarObjectKeyPrefix(babyId) {
	return `babies/${babyId}/avatar/`;
}

function createAvatarObjectKey(babyId, contentType) {
	const extension = AVATAR_CONTENT_TYPES.get(contentType);
	return `${avatarObjectKeyPrefix(babyId)}${randomUUID()}.${extension}`;
}

function isValidAvatarObjectKey(babyId, objectKey) {
	return objectKey.startsWith(avatarObjectKeyPrefix(babyId));
}

async function deleteAvatarObjectBestEffort(objectKey) {
	if (!objectKey) {
		return;
	}

	try {
		await deleteS3Object({ objectKey });
	} catch (error) {
		console.warn("Failed to delete old avatar object from S3.", error);
	}
}

function findAccessibleBabyForUser(userId, babyId, client = prisma) {
	return client.baby.findFirst({
		where: {
			id: babyId,
			deletedAt: null,
			users: {
				some: {
					userId,
					deletedAt: null,
					user: {
						deletedAt: null,
					},
				},
			},
		},
	});
}

export async function listBabiesForUser(userId) {
	const accesses = await prisma.babyUser.findMany({
		where: {
			userId,
			deletedAt: null,
			user: {
				deletedAt: null,
			},
			baby: {
				deletedAt: null,
			},
		},
		include: {
			baby: true,
		},
		orderBy: {
			createdAt: "desc",
		},
	});

	return Promise.all(accesses.map(serializeBabyWithRole));
}

export async function createBabyForUser(userId, input) {
	const result = await prisma.$transaction(async (tx) => {
		const baby = await tx.baby.create({
			data: {
				name: input.name,
				birthdate: new Date(`${input.birthdate}T00:00:00.000Z`),
				sex: input.sex,
				timezone: input.timezone,
				avatarObjectKey: input.avatarObjectKey,
				createdById: userId,
			},
		});

		const access = await tx.babyUser.create({
			data: {
				babyId: baby.id,
				userId,
				role: input.role,
			},
		});

		return { baby, access };
	});

	return {
		baby: await serializeBaby(result.baby),
		access: {
			id: result.access.id,
			babyId: result.access.babyId,
			userId: result.access.userId,
			role: result.access.role,
			createdAt: result.access.createdAt.toISOString(),
			updatedAt: result.access.updatedAt.toISOString(),
		},
	};
}

export async function updateBabyForUser(userId, babyId, input) {
	const access = await prisma.babyUser.findFirst({
		where: {
			userId,
			babyId,
			deletedAt: null,
			user: {
				deletedAt: null,
			},
			baby: {
				deletedAt: null,
			},
		},
		include: {
			baby: true,
		},
	});

	if (!access) {
		return null;
	}

	const baby = await prisma.$transaction(async (tx) => {
		const updatedBaby = await tx.baby.update({
			where: { id: babyId },
			data: {
				name: input.name,
				birthdate: new Date(`${input.birthdate}T00:00:00.000Z`),
				sex: input.sex,
				...(input.timezone ? { timezone: input.timezone } : {}),
			},
		});

		if (input.timezone && input.timezone !== access.baby.timezone) {
			await rebuildRoutineSummariesForBaby(tx, updatedBaby);
		}

		return updatedBaby;
	});

	return {
		baby: await serializeBaby(baby),
	};
}

export async function createBabyAvatarUploadForUser(userId, babyId, input) {
	if (!AVATAR_CONTENT_TYPES.has(input.contentType)) {
		return { error: "INVALID_AVATAR_CONTENT_TYPE" };
	}

	if (input.sizeBytes > MAX_AVATAR_SIZE_BYTES) {
		return { error: "AVATAR_FILE_TOO_LARGE" };
	}

	const baby = await findAccessibleBabyForUser(userId, babyId);

	if (!baby) {
		return { error: "BABY_NOT_FOUND" };
	}

	const objectKey = createAvatarObjectKey(babyId, input.contentType);
	const uploadUrl = await createPresignedPutUrl({
		contentType: input.contentType,
		objectKey,
	});

	return {
		objectKey,
		uploadUrl,
		expiresIn: S3_PRESIGNED_PUT_EXPIRES_IN_SECONDS,
	};
}

export async function confirmBabyAvatarForUser(userId, babyId, input) {
	const baby = await findAccessibleBabyForUser(userId, babyId);

	if (!baby) {
		return { error: "BABY_NOT_FOUND" };
	}

	if (!isValidAvatarObjectKey(babyId, input.objectKey)) {
		return { error: "INVALID_AVATAR_OBJECT_KEY" };
	}

	const updatedBaby = await prisma.baby.update({
		where: { id: babyId },
		data: { avatarObjectKey: input.objectKey },
	});

	if (baby.avatarObjectKey && baby.avatarObjectKey !== input.objectKey) {
		await deleteAvatarObjectBestEffort(baby.avatarObjectKey);
	}

	return {
		baby: await serializeBaby(updatedBaby),
	};
}

export async function removeBabyAvatarForUser(userId, babyId) {
	const baby = await findAccessibleBabyForUser(userId, babyId);

	if (!baby) {
		return { error: "BABY_NOT_FOUND" };
	}

	const updatedBaby = await prisma.baby.update({
		where: { id: babyId },
		data: { avatarObjectKey: null },
	});

	await deleteAvatarObjectBestEffort(baby.avatarObjectKey);

	return {
		baby: await serializeBaby(updatedBaby),
	};
}

export async function deleteBabyForUser(userId, babyId) {
	const access = await prisma.babyUser.findFirst({
		where: {
			userId,
			babyId,
			deletedAt: null,
			user: {
				deletedAt: null,
			},
			baby: {
				deletedAt: null,
			},
		},
		include: {
			baby: true,
		},
	});

	if (!access) {
		return false;
	}

	const deletedAt = new Date();

	await prisma.$transaction(async (tx) => {
		if (access.baby.createdById === userId) {
			await Promise.all([
				tx.routineMealEvent.deleteMany({ where: { babyId } }),
				tx.routineDiaperEvent.deleteMany({ where: { babyId } }),
				tx.sleepSession.deleteMany({ where: { babyId } }),
				tx.dailyRoutineSummary.deleteMany({ where: { babyId } }),
			]);

			await tx.baby.update({
				where: { id: babyId },
				data: { deletedAt },
			});

			await tx.babyUser.updateMany({
				where: {
					babyId,
					deletedAt: null,
				},
				data: { deletedAt },
			});

			return;
		}

		await tx.babyUser.updateMany({
			where: {
				id: access.id,
				deletedAt: null,
			},
			data: { deletedAt },
		});
	});

	return true;
}
