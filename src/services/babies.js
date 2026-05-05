import prisma from "../db/prisma.js";

function serializeBaby(baby) {
	return {
		id: baby.id,
		name: baby.name,
		birthdate: baby.birthdate.toISOString().slice(0, 10),
		sex: baby.sex,
		timezone: baby.timezone,
		avatarObjectKey: baby.avatarObjectKey,
		createdAt: baby.createdAt.toISOString(),
		updatedAt: baby.updatedAt.toISOString(),
		deletedAt: baby.deletedAt ? baby.deletedAt.toISOString() : null,
	};
}

function serializeBabyWithRole(access) {
	return {
		...serializeBaby(access.baby),
		role: access.role,
	};
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

	return accesses.map(serializeBabyWithRole);
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
		baby: serializeBaby(result.baby),
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
