import prisma from "../db/prisma.js";
import { findAccessibleBaby } from "./babyAccess.js";

function serializeGrowthRecord(record) {
	return {
		id: record.id,
		babyId: record.babyId,
		measuredDate: record.measuredDate.toISOString().slice(0, 10),
		measuredAt: record.measuredAt.toISOString(),
		heightMm: record.heightMm,
		weightGrams: record.weightGrams,
		headCircumferenceMm: record.headCircumferenceMm,
		notes: record.notes,
		createdAt: record.createdAt.toISOString(),
		updatedAt: record.updatedAt.toISOString(),
	};
}

function dateOnly(value) {
	return new Date(`${value}T00:00:00.000Z`);
}

function getTimezoneOffsetMs(timezone, value) {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	}).formatToParts(value);
	const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	const localAsUtc = Date.UTC(
		Number(byType.year),
		Number(byType.month) - 1,
		Number(byType.day),
		Number(byType.hour),
		Number(byType.minute),
		Number(byType.second),
	);

	return localAsUtc - value.getTime();
}

function babyLocalDateStart(measuredDate, timezone) {
	const [year, month, day] = measuredDate.split("-").map(Number);
	const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
	const offsetMs = getTimezoneOffsetMs(timezone, utcGuess);

	return new Date(utcGuess.getTime() - offsetMs);
}

function normalizeNotes(notes) {
	if (notes === undefined) {
		return undefined;
	}

	const trimmed = notes.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeGrowthInput(input, baby) {
	return {
		measuredDate: dateOnly(input.measuredDate),
		measuredAt: babyLocalDateStart(input.measuredDate, baby.timezone),
		heightMm: input.heightMm ?? null,
		weightGrams: input.weightGrams ?? null,
		headCircumferenceMm: input.headCircumferenceMm ?? null,
		notes: normalizeNotes(input.notes),
	};
}

async function findDuplicateMeasuredDate(client, babyId, measuredDate, excludedId = null) {
	return client.babyGrowth.findFirst({
		where: {
			babyId,
			measuredDate: dateOnly(measuredDate),
			...(excludedId ? { id: { not: excludedId } } : {}),
		},
	});
}

export async function listGrowthRecordsForUser(userId, babyId) {
	const baby = await findAccessibleBaby(userId, babyId);

	if (!baby) {
		return { error: "BABY_NOT_FOUND" };
	}

	const records = await prisma.babyGrowth.findMany({
		where: { babyId },
		orderBy: { measuredDate: "desc" },
	});

	return {
		growthRecords: records.map(serializeGrowthRecord),
	};
}

export async function createGrowthRecordForUser(userId, babyId, input) {
	const baby = await findAccessibleBaby(userId, babyId);

	if (!baby) {
		return { error: "BABY_NOT_FOUND" };
	}

	const duplicate = await findDuplicateMeasuredDate(prisma, babyId, input.measuredDate);

	if (duplicate) {
		return { error: "GROWTH_RECORD_DATE_EXISTS" };
	}

	const record = await prisma.babyGrowth.create({
		data: {
			...normalizeGrowthInput(input, baby),
			babyId,
		},
	});

	return {
		growthRecord: serializeGrowthRecord(record),
	};
}

export async function updateGrowthRecordForUser(userId, babyId, growthId, input) {
	const baby = await findAccessibleBaby(userId, babyId);

	if (!baby) {
		return { error: "BABY_NOT_FOUND" };
	}

	const existing = await prisma.babyGrowth.findFirst({
		where: {
			id: growthId,
			babyId,
		},
	});

	if (!existing) {
		return { error: "GROWTH_RECORD_NOT_FOUND" };
	}

	const duplicate = await findDuplicateMeasuredDate(prisma, babyId, input.measuredDate, growthId);

	if (duplicate) {
		return { error: "GROWTH_RECORD_DATE_EXISTS" };
	}

	const record = await prisma.babyGrowth.update({
		where: { id: growthId },
		data: normalizeGrowthInput(input, baby),
	});

	return {
		growthRecord: serializeGrowthRecord(record),
	};
}

export async function deleteGrowthRecordForUser(userId, babyId, growthId) {
	const baby = await findAccessibleBaby(userId, babyId);

	if (!baby) {
		return { error: "BABY_NOT_FOUND" };
	}

	const existing = await prisma.babyGrowth.findFirst({
		where: {
			id: growthId,
			babyId,
		},
	});

	if (!existing) {
		return { error: "GROWTH_RECORD_NOT_FOUND" };
	}

	await prisma.babyGrowth.delete({
		where: { id: growthId },
	});

	return { deleted: true };
}
