import prisma from "../db/prisma.js";

export async function findAccessibleBaby(userId, babyId, client = prisma) {
	const access = await client.babyUser.findFirst({
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

	return access?.baby ?? null;
}
