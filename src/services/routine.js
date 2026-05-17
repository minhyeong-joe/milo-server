import prisma from "../db/prisma.js";
import { findAccessibleBaby } from "./babyAccess.js";

const EMPTY_SUMMARY = {
	meals: {
		totalCount: 0,
		byType: {
			breastfeed: { count: 0, totalMinutes: 0 },
			breastMilk: { count: 0, totalAmountMl: 0 },
			formula: { count: 0, totalAmountMl: 0 },
			solid: { count: 0, totalServings: 0, totalGrams: 0 },
		},
	},
	diapers: {
		totalChanges: 0,
		byType: {
			wet: 0,
			dirty: 0,
			both: 0,
			dry: 0,
		},
	},
	sleep: {
		totalSessions: 0,
		totalMinutes: 0,
		byType: {
			nap: { count: 0, totalMinutes: 0 },
			nighttime: { count: 0, totalMinutes: 0 },
		},
	},
};

function cloneSummary() {
	return structuredClone(EMPTY_SUMMARY);
}

function dateOnly(value) {
	return new Date(`${value}T00:00:00.000Z`);
}

function addDays(dateString, days) {
	const date = dateOnly(dateString);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function sortDateStringsDescending(a, b) {
	return b.localeCompare(a);
}

function dateRange(startDate, endDate) {
	const dates = [];
	let current = startDate;

	while (current <= endDate) {
		dates.push(current);
		current = addDays(current, 1);
	}

	return dates;
}

function queryBounds(startDate, endDate) {
	return {
		start: dateOnly(addDays(startDate, -2)),
		end: dateOnly(addDays(endDate, 3)),
	};
}

function localDateForInstant(value, timezone) {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(value);
	const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

	return `${byType.year}-${byType.month}-${byType.day}`;
}

function serializeBaby(baby) {
	return {
		id: baby.id,
		name: baby.name,
		birthdate: baby.birthdate.toISOString().slice(0, 10),
		timezone: baby.timezone,
	};
}

function serializeMeal(row) {
	return {
		id: row.id,
		clientMutationId: row.clientMutationId,
		kind: "meal",
		time: row.loggedAt.toISOString(),
		type: row.mealType,
		amountMl: row.amountMl,
		durationMinutes: row.durationMinutes,
		amountServings: row.amountServings === null ? null : Number(row.amountServings),
		amountGrams: row.amountGrams,
		breastSide: row.breastSide === null? null : row.breastSide,
		notes: row.notes,
	};
}

function serializeDiaper(row) {
	return {
		id: row.id,
		clientMutationId: row.clientMutationId,
		kind: "diaper",
		time: row.loggedAt.toISOString(),
		type: row.diaperType,
		color: row.color,
		notes: row.notes,
	};
}

function serializeSleep(row) {
	return {
		id: row.id,
		clientMutationId: row.clientMutationId,
		kind: "sleep",
		type: row.sleepType,
		startTime: row.startTime.toISOString(),
		endTime: row.endTime ? row.endTime.toISOString() : null,
		notes: row.notes,
	};
}

function serializeMealPatternLog(row) {
	return {
		id: row.id,
		kind: "meal",
		time: row.loggedAt.toISOString(),
		type: row.mealType,
		amountMl: row.amountMl,
		durationMinutes: row.durationMinutes,
		amountServings: row.amountServings === null ? null : Number(row.amountServings),
		amountGrams: row.amountGrams,
	};
}

function serializeDiaperPatternLog(row) {
	return {
		id: row.id,
		kind: "diaper",
		time: row.loggedAt.toISOString(),
		type: row.diaperType,
	};
}

function serializeSleepPatternLog(row) {
	return {
		id: row.id,
		kind: "sleep",
		type: row.sleepType,
		startTime: row.startTime.toISOString(),
		endTime: row.endTime ? row.endTime.toISOString() : null,
	};
}

function getSleepRoutineDate(row, timezone) {
	if (row.sleepType === "nighttime" && row.endTime) {
		return localDateForInstant(row.endTime, timezone);
	}

	return localDateForInstant(row.startTime, timezone);
}

function getSleepOverlapDates(row, timezone) {
	const endTime = row.endTime ?? new Date();

	if (endTime.getTime() <= row.startTime.getTime()) {
		return [localDateForInstant(row.startTime, timezone)];
	}

	return dateRange(
		localDateForInstant(row.startTime, timezone),
		localDateForInstant(endTime, timezone),
	);
}

function getEventRoutineDate(event, timezone) {
	if (event.kind === "sleep") {
		return getSleepRoutineDate(event.raw, timezone);
	}

	return localDateForInstant(event.sortTime, timezone);
}

function getSummaryForRows({ meals, diapers, sleeps }, timezone, targetDate) {
	const summary = cloneSummary();

	for (const meal of meals) {
		if (localDateForInstant(meal.loggedAt, timezone) !== targetDate) {
			continue;
		}

		summary.meals.totalCount += 1;
		const typeSummary = summary.meals.byType[meal.mealType];
		typeSummary.count += 1;

		if (meal.mealType === "breastfeed") {
			typeSummary.totalMinutes += meal.durationMinutes ?? 0;
		} else if (meal.mealType === "solid") {
			typeSummary.totalServings += meal.amountServings === null ? 0 : Number(meal.amountServings);
			typeSummary.totalGrams += meal.amountGrams ?? 0;
		} else {
			typeSummary.totalAmountMl += meal.amountMl ?? 0;
		}
	}

	for (const diaper of diapers) {
		if (localDateForInstant(diaper.loggedAt, timezone) !== targetDate) {
			continue;
		}

		summary.diapers.totalChanges += 1;
		summary.diapers.byType[diaper.diaperType] += 1;
	}

	for (const sleep of sleeps) {
		if (!sleep.endTime || getSleepRoutineDate(sleep, timezone) !== targetDate) {
			continue;
		}

		const minutes = Math.max(
			0,
			Math.round((sleep.endTime.getTime() - sleep.startTime.getTime()) / 60000),
		);

		summary.sleep.totalSessions += 1;
		summary.sleep.totalMinutes += minutes;
		summary.sleep.byType[sleep.sleepType].count += 1;
		summary.sleep.byType[sleep.sleepType].totalMinutes += minutes;
	}

	return summary;
}

async function loadRowsForDates(client, babyId, startDate, endDate) {
	const bounds = queryBounds(startDate, endDate);
	const [meals, diapers, sleeps] = await Promise.all([
		client.routineMealEvent.findMany({
			where: {
				babyId,
				loggedAt: {
					gte: bounds.start,
					lt: bounds.end,
				},
			},
		}),
		client.routineDiaperEvent.findMany({
			where: {
				babyId,
				loggedAt: {
					gte: bounds.start,
					lt: bounds.end,
				},
			},
		}),
		client.sleepSession.findMany({
			where: {
				babyId,
				startTime: {
					lt: bounds.end,
				},
				OR: [
					{
						endTime: {
							gte: bounds.start,
						},
					},
					{
						endTime: null,
					},
				],
			},
		}),
	]);

	return { meals, diapers, sleeps };
}

async function recomputeSummaries(client, baby, dates) {
	const uniqueDates = [...new Set(dates)].filter(Boolean).sort();

	if (uniqueDates.length === 0) {
		return;
	}

	const rows = await loadRowsForDates(
		client,
		baby.id,
		uniqueDates[0],
		uniqueDates[uniqueDates.length - 1],
	);
	const computedAt = new Date();

	await Promise.all(
		uniqueDates.map((summaryDate) => {
			const summary = getSummaryForRows(rows, baby.timezone, summaryDate);

			return client.dailyRoutineSummary.upsert({
				where: {
					babyId_summaryDate: {
						babyId: baby.id,
						summaryDate: dateOnly(summaryDate),
					},
				},
				create: {
					babyId: baby.id,
					summaryDate: dateOnly(summaryDate),
					mealSummaryJson: summary.meals,
					diaperSummaryJson: summary.diapers,
					sleepSummaryJson: summary.sleep,
					computedAt,
				},
				update: {
					mealSummaryJson: summary.meals,
					diaperSummaryJson: summary.diapers,
					sleepSummaryJson: summary.sleep,
					computedAt,
				},
			});
		}),
	);
}

function summaryDateForMeal(row, timezone) {
	return localDateForInstant(row.loggedAt, timezone);
}

function summaryDateForDiaper(row, timezone) {
	return localDateForInstant(row.loggedAt, timezone);
}

function summaryDateForSleep(row, timezone) {
	if (!row.endTime) {
		return null;
	}

	return getSleepRoutineDate(row, timezone);
}

function getSummaryForStoredRow(kind, row, timezone) {
	if (!row) {
		return null;
	}

	if (kind === "meal") {
		return summaryDateForMeal(row, timezone);
	}

	if (kind === "diaper") {
		return summaryDateForDiaper(row, timezone);
	}

	return summaryDateForSleep(row, timezone);
}

async function getExistingCreateByClientMutationId(client, babyId, kind, clientMutationId) {
	if (!clientMutationId) {
		return null;
	}

	if (kind === "meal") {
		return client.routineMealEvent.findFirst({ where: { babyId, clientMutationId } });
	}

	if (kind === "diaper") {
		return client.routineDiaperEvent.findFirst({ where: { babyId, clientMutationId } });
	}

	return client.sleepSession.findFirst({ where: { babyId, clientMutationId } });
}

function serializeStoredRoutineRow(kind, row) {
	if (kind === "meal") {
		return serializeMeal(row);
	}

	if (kind === "diaper") {
		return serializeDiaper(row);
	}

	return serializeSleep(row);
}

async function getMutationResponseForStoredRow(client, baby, kind, row) {
	const timelineDate = getTimelineDateForStoredRow(kind, row, baby.timezone);
	const affectedDates = timelineDate ? [timelineDate] : [];

	return {
		event: serializeStoredRoutineRow(kind, row),
		affectedDailyLogs: await getAffectedDailyLogs(client, baby, affectedDates),
		lastLogged: await getLastLoggedForBaby(client, baby.id),
	};
}

function getTimelineDateForStoredRow(kind, row, timezone) {
	if (!row) {
		return null;
	}

	if (kind === "meal") {
		return summaryDateForMeal(row, timezone);
	}

	if (kind === "diaper") {
		return summaryDateForDiaper(row, timezone);
	}

	return getSleepRoutineDate(row, timezone);
}

async function getAffectedDailyLogs(client, baby, dates) {
	if (dates.length === 0) {
		return [];
	}

	return getRoutineDaysForDates(client, baby, dates);
}

function normalizeNotes(notes) {
	if (notes === undefined) {
		return undefined;
	}

	const trimmed = notes.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeMealInput(input) {
	const base = {
		clientMutationId: input.clientMutationId,
		loggedAt: new Date(input.time),
		mealType: input.type,
		amountMl: null,
		durationMinutes: null,
		amountServings: null,
		amountGrams: null,
		breastSide: null,
		notes: normalizeNotes(input.notes),
	};

	if (input.type === "breastfeed") {
		base.durationMinutes = input.durationMinutes;
		base.breastSide = input.breastSide ?? null;
	} else if (input.type === "solid") {
		base.amountServings = input.amountServings ?? null;
		base.amountGrams = input.amountGrams ?? null;
	} else {
		base.amountMl = input.amountMl;
	}

	return base;
}

function normalizeDiaperInput(input) {
	return {
		clientMutationId: input.clientMutationId,
		loggedAt: new Date(input.time),
		diaperType: input.type,
		color: input.type === "dirty" || input.type === "both" ? input.color ?? null : null,
		notes: normalizeNotes(input.notes),
	};
}

function normalizeSleepInput(input) {
	return {
		clientMutationId: input.clientMutationId,
		sleepType: input.type,
		startTime: new Date(input.startTime),
		endTime: input.endTime ? new Date(input.endTime) : null,
		notes: normalizeNotes(input.notes),
	};
}

async function assertNoOtherActiveSleep(client, babyId, excludedId = null) {
	const existing = await client.sleepSession.findFirst({
		where: {
			babyId,
			endTime: null,
			...(excludedId ? { id: { not: excludedId } } : {}),
		},
	});

	return !existing;
}

export async function getRoutineDaysForUser(
	userId,
	babyId,
	startDate,
	count = 7,
	includeLastLogged = false,
) {
	const baby = await findAccessibleBaby(userId, babyId);

	if (!baby) {
		return null;
	}

	const result = await getSparseRoutineDaysForBaby(prisma, baby, startDate, count);

	if (!includeLastLogged) {
		return result;
	}

	return {
		...result,
		lastLogged: await getLastLoggedForBaby(prisma, baby.id),
	};
}

export async function getRoutineStatsForUser(userId, babyId, startDate, endDate) {
	const baby = await findAccessibleBaby(userId, babyId);

	if (!baby) {
		return null;
	}

	return getRoutineStatsForBaby(prisma, baby, startDate, endDate);
}

async function getRoutineStatsForBaby(client, baby, startDate, endDate) {
	const dates = dateRange(startDate, endDate);
	const rows = await loadRowsForDates(client, baby.id, startDate, endDate);
	const logsByDate = new Map(dates.map((date) => [date, []]));

	for (const meal of rows.meals) {
		const date = localDateForInstant(meal.loggedAt, baby.timezone);
		if (logsByDate.has(date)) {
			logsByDate.get(date).push({
				sortTime: meal.loggedAt,
				value: serializeMealPatternLog(meal),
			});
		}
	}

	for (const diaper of rows.diapers) {
		const date = localDateForInstant(diaper.loggedAt, baby.timezone);
		if (logsByDate.has(date)) {
			logsByDate.get(date).push({
				sortTime: diaper.loggedAt,
				value: serializeDiaperPatternLog(diaper),
			});
		}
	}

	for (const sleep of rows.sleeps) {
		for (const date of getSleepOverlapDates(sleep, baby.timezone)) {
			if (logsByDate.has(date)) {
				logsByDate.get(date).push({
					sortTime: sleep.endTime ?? sleep.startTime,
					value: serializeSleepPatternLog(sleep),
				});
			}
		}
	}

	return {
		startDate,
		endDate,
		dayCount: dates.length,
		days: dates.map((date) => ({
			date,
			logs: logsByDate
				.get(date)
				.sort((left, right) => left.sortTime.getTime() - right.sortTime.getTime())
				.map((event) => event.value),
		})),
		summary: getRoutineStatsSummary(rows, baby.timezone, startDate, endDate, dates.length),
	};
}

function getRoutineStatsSummary(rows, timezone, startDate, endDate, dayCount) {
	const totals = {
		meal: {
			total: { count: 0 },
			breastfeed: { count: 0, durationMinutes: 0 },
			breastMilk: { count: 0, amountMl: 0 },
			formula: { count: 0, amountMl: 0 },
			solid: { count: 0, amountServings: 0, amountServingsCount: 0, amountGrams: 0, amountGramsCount: 0 },
		},
		diaper: {
			total: { count: 0 },
			wet: { count: 0 },
			dirty: { count: 0 },
			dry: { count: 0 },
			both: { count: 0 },
		},
		sleep: {
			total: { count: 0, durationMinutes: 0 },
			nap: { count: 0, durationMinutes: 0 },
			nighttime: { count: 0, durationMinutes: 0 },
		},
	};
	const mealDays = {
		total: new Set(),
		breastfeed: new Set(),
		breastMilk: new Set(),
		formula: new Set(),
		solid: new Set(),
	};
	const diaperDays = new Set();
	const sleepDays = new Set();

	for (const meal of rows.meals) {
		const date = localDateForInstant(meal.loggedAt, timezone);
		if (date < startDate || date > endDate) {
			continue;
		}

		totals.meal.total.count += 1;
		mealDays.total.add(date);
		mealDays[meal.mealType].add(date);
		const mealType = totals.meal[meal.mealType];
		mealType.count += 1;

		if (meal.mealType === "breastfeed") {
			mealType.durationMinutes += meal.durationMinutes ?? 0;
		} else if (meal.mealType === "solid") {
			if (meal.amountServings !== null) {
				mealType.amountServings += Number(meal.amountServings);
				mealType.amountServingsCount += 1;
			}
			if (meal.amountGrams !== null) {
				mealType.amountGrams += meal.amountGrams;
				mealType.amountGramsCount += 1;
			}
		} else {
			mealType.amountMl += meal.amountMl ?? 0;
		}
	}

	for (const diaper of rows.diapers) {
		const date = localDateForInstant(diaper.loggedAt, timezone);
		if (date < startDate || date > endDate) {
			continue;
		}

		totals.diaper.total.count += 1;
		diaperDays.add(date);
		totals.diaper[diaper.diaperType].count += 1;
	}

	for (const sleep of rows.sleeps) {
		const date = getSleepRoutineDate(sleep, timezone);
		if (date < startDate || date > endDate) {
			continue;
		}

		totals.sleep.total.count += 1;
		sleepDays.add(date);
		totals.sleep[sleep.sleepType].count += 1;

		if (sleep.endTime) {
			const minutes = Math.max(
				0,
				Math.round((sleep.endTime.getTime() - sleep.startTime.getTime()) / 60000),
			);
			totals.sleep.total.durationMinutes += minutes;
			totals.sleep[sleep.sleepType].durationMinutes += minutes;
		}
	}

	return {
		meal: {
			activeDays: mealDays.total.size,
			totalSessions: totals.meal.total.count,
			avgSessionsPerActiveDay: averagePerValue(
				totals.meal.total.count,
				mealDays.total.size,
			),
			byType: {
				breastfeed: {
					activeDays: mealDays.breastfeed.size,
					totalSessions: totals.meal.breastfeed.count,
					totalDurationMinutes: totals.meal.breastfeed.durationMinutes,
					avgSessionsPerActiveDay: averagePerValue(
						totals.meal.breastfeed.count,
						mealDays.breastfeed.size,
					),
					avgDurationMinutesPerSession: averagePerValue(
						totals.meal.breastfeed.durationMinutes,
						totals.meal.breastfeed.count,
					),
					avgDurationMinutesPerActiveDay: averagePerValue(
						totals.meal.breastfeed.durationMinutes,
						mealDays.breastfeed.size,
					),
				},

				breastMilk: {
					activeDays: mealDays.breastMilk.size,
					totalSessions: totals.meal.breastMilk.count,
					totalAmountMl: totals.meal.breastMilk.amountMl,
					avgSessionsPerActiveDay: averagePerValue(
						totals.meal.breastMilk.count,
						mealDays.breastMilk.size,
					),
					avgAmountMlPerSession: averagePerValue(
						totals.meal.breastMilk.amountMl,
						totals.meal.breastMilk.count,
					),
					avgAmountMlPerActiveDay: averagePerValue(
						totals.meal.breastMilk.amountMl,
						mealDays.breastMilk.size,
					),
				},

				formula: {
					activeDays: mealDays.formula.size,
					totalSessions: totals.meal.formula.count,
					totalAmountMl: totals.meal.formula.amountMl,
					avgSessionsPerActiveDay: averagePerValue(
						totals.meal.formula.count,
						mealDays.formula.size,
					),
					avgAmountMlPerSession: averagePerValue(
						totals.meal.formula.amountMl,
						totals.meal.formula.count,
					),
					avgAmountMlPerActiveDay: averagePerValue(
						totals.meal.formula.amountMl,
						mealDays.formula.size,
					),
				},

				solid: {
					activeDays: mealDays.solid.size,
					totalSessions: totals.meal.solid.count,

					totalServings: totals.meal.solid.amountServings,
					totalGrams: totals.meal.solid.amountGrams,
					servingEntryCount: totals.meal.solid.amountServingsCount,
					gramEntryCount: totals.meal.solid.amountGramsCount,

					avgSessionsPerActiveDay: averagePerValue(
						totals.meal.solid.count,
						mealDays.solid.size,
					),
					avgServingsPerSession: averagePerValue(
						totals.meal.solid.amountServings,
						totals.meal.solid.amountServingsCount,
					),
					avgGramsPerSession: averagePerValue(
						totals.meal.solid.amountGrams,
						totals.meal.solid.amountGramsCount,
					),
					avgServingsPerActiveDay: averagePerValue(
						totals.meal.solid.amountServings,
						mealDays.solid.size,
					),
					avgGramsPerActiveDay: averagePerValue(
						totals.meal.solid.amountGrams,
						mealDays.solid.size,
					),
				},
			},
		},

		diaper: {
			activeDays: diaperDays.size,
			totalChanges: totals.diaper.total.count,
			avgChangesPerActiveDay: averagePerValue(
				totals.diaper.total.count,
				diaperDays.size,
			),
			byType: {
				both: {
					totalChanges: totals.diaper.both.count,
					avgChangesPerActiveDay: averagePerValue(
						totals.diaper.both.count,
						diaperDays.size,
					),
				},
				dirty: {
					totalChanges: totals.diaper.dirty.count,
					avgChangesPerActiveDay: averagePerValue(
						totals.diaper.dirty.count,
						diaperDays.size,
					),
				},
				dry: {
					totalChanges: totals.diaper.dry.count,
					avgChangesPerActiveDay: averagePerValue(
						totals.diaper.dry.count,
						diaperDays.size,
					),
				},
				wet: {
					totalChanges: totals.diaper.wet.count,
					avgChangesPerActiveDay: averagePerValue(
						totals.diaper.wet.count,
						diaperDays.size,
					),
				},
			},
		},

		sleep: {
			activeDays: sleepDays.size,
			totalSessions: totals.sleep.total.count,
			totalDurationMinutes: totals.sleep.total.durationMinutes,
			avgSessionsPerActiveDay: averagePerValue(
				totals.sleep.total.count,
				sleepDays.size,
			),
			avgDurationMinutesPerSession: averagePerValue(
				totals.sleep.total.durationMinutes,
				totals.sleep.total.count,
			),
			avgDurationMinutesPerActiveDay: averagePerValue(
				totals.sleep.total.durationMinutes,
				sleepDays.size,
			),
			byType: {
				nap: {
					totalSessions: totals.sleep.nap.count,
					totalDurationMinutes: totals.sleep.nap.durationMinutes,
					avgSessionsPerActiveDay: averagePerValue(
						totals.sleep.nap.count,
						sleepDays.size,
					),
					avgDurationMinutesPerSession: averagePerValue(
						totals.sleep.nap.durationMinutes,
						totals.sleep.nap.count,
					),
					avgDurationMinutesPerActiveDay: averagePerValue(
						totals.sleep.nap.durationMinutes,
						sleepDays.size,
					),
				},
				nighttime: {
					totalSessions: totals.sleep.nighttime.count,
					totalDurationMinutes: totals.sleep.nighttime.durationMinutes,
					avgSessionsPerActiveDay: averagePerValue(
						totals.sleep.nighttime.count,
						sleepDays.size,
					),
					avgDurationMinutesPerSession: averagePerValue(
						totals.sleep.nighttime.durationMinutes,
						totals.sleep.nighttime.count,
					),
					avgDurationMinutesPerActiveDay: averagePerValue(
						totals.sleep.nighttime.durationMinutes,
						sleepDays.size,
					),
				},
			},
		},
	};
}

function averagePerDay(total, dayCount) {
	return dayCount > 0 ? total / dayCount : 0;
}

function averagePerValue(total, count) {
	return count > 0 ? total / count : 0;
}

async function getLastLoggedForBaby(client, babyId) {
	const [meal, diaper, activeSleep, completedSleep] = await Promise.all([
		client.routineMealEvent.findFirst({
			where: { babyId },
			orderBy: { loggedAt: "desc" },
		}),
		client.routineDiaperEvent.findFirst({
			where: { babyId },
			orderBy: { loggedAt: "desc" },
		}),
		client.sleepSession.findFirst({
			where: {
				babyId,
				endTime: null,
			},
			orderBy: { startTime: "desc" },
		}),
		client.sleepSession.findFirst({
			where: {
				babyId,
				endTime: { not: null },
			},
			orderBy: { endTime: "desc" },
		}),
	]);
	const sleep = activeSleep ?? completedSleep;

	return {
		meal: meal
			? {
					time: meal.loggedAt.toISOString(),
					type: meal.mealType,
				}
			: null,
		diaper: diaper
			? {
					time: diaper.loggedAt.toISOString(),
					type: diaper.diaperType,
				}
			: null,
		sleep: sleep
			? {
					id: sleep.id,
					startTime: sleep.startTime.toISOString(),
					endTime: sleep.endTime ? sleep.endTime.toISOString() : null,
					type: sleep.sleepType,
					isActive: !sleep.endTime,
					lastLoggedAt: (sleep.endTime ?? sleep.startTime).toISOString(),
				}
			: null,
	};
}

async function getSparseRoutineDaysForBaby(client, baby, startDate, count) {
	const rows = await loadRowsForDates(
		client,
		baby.id,
		baby.birthdate.toISOString().slice(0, 10),
		startDate,
	);
	const activeDates = getActiveDatesFromRows(rows, baby.timezone)
		.filter((date) => date <= startDate)
		.sort(sortDateStringsDescending);
	const dates = activeDates.slice(0, count);
	const nextStartDate = activeDates[count] ?? null;

	return {
		dailyLogs: await buildRoutineDaysForDates(client, baby, dates, rows),
		nextStartDate,
	};
}

async function getRoutineDaysForDates(client, baby, dates) {
	const uniqueDates = [...new Set(dates)].filter(Boolean).sort();

	if (uniqueDates.length === 0) {
		return [];
	}

	return buildRoutineDaysForDates(
		client,
		baby,
		uniqueDates,
		await loadRowsForDates(client, baby.id, uniqueDates[0], uniqueDates[uniqueDates.length - 1]),
	);
}

function getActiveDatesFromRows(rows, timezone) {
	const dates = new Set();

	for (const meal of rows.meals) {
		dates.add(localDateForInstant(meal.loggedAt, timezone));
	}

	for (const diaper of rows.diapers) {
		dates.add(localDateForInstant(diaper.loggedAt, timezone));
	}

	for (const sleep of rows.sleeps) {
		dates.add(getSleepRoutineDate(sleep, timezone));
	}

	return [...dates];
}

async function buildRoutineDaysForDates(client, baby, dates, rows) {
	if (dates.length === 0) {
		return [];
	}

	const sortedDates = [...dates].sort();
	const datesByKey = new Set(dates);
	const summaries = await client.dailyRoutineSummary.findMany({
		where: {
			babyId: baby.id,
			summaryDate: {
				gte: dateOnly(sortedDates[0]),
				lte: dateOnly(sortedDates[sortedDates.length - 1]),
			},
		},
	});
	const summariesByDate = new Map(
		summaries.map((summary) => [summary.summaryDate.toISOString().slice(0, 10), summary]),
	);
	const eventsByDate = new Map(dates.map((date) => [date, []]));

	for (const meal of rows.meals) {
		const event = {
			sortTime: meal.loggedAt,
			raw: meal,
			value: serializeMeal(meal),
		};
		const date = getEventRoutineDate({ kind: "meal", ...event }, baby.timezone);
		if (datesByKey.has(date)) {
			eventsByDate.get(date)?.push(event);
		}
	}

	for (const diaper of rows.diapers) {
		const event = {
			sortTime: diaper.loggedAt,
			raw: diaper,
			value: serializeDiaper(diaper),
		};
		const date = getEventRoutineDate({ kind: "diaper", ...event }, baby.timezone);
		if (datesByKey.has(date)) {
			eventsByDate.get(date)?.push(event);
		}
	}

	for (const sleep of rows.sleeps) {
		const event = {
			sortTime: sleep.endTime ?? sleep.startTime,
			raw: sleep,
			value: serializeSleep(sleep),
		};
		const date = getEventRoutineDate({ kind: "sleep", ...event }, baby.timezone);
		if (datesByKey.has(date)) {
			eventsByDate.get(date)?.push(event);
		}
	}

	return [...dates].sort(sortDateStringsDescending).map((date) => {
		const summary = summariesByDate.get(date);
		const timeline = eventsByDate
			.get(date)
			.sort((a, b) => b.sortTime.getTime() - a.sortTime.getTime())
			.map((event) => event.value);

		return {
			date,
			timeline,
			summary: summary
				? {
						meals: summary.mealSummaryJson,
						diapers: summary.diaperSummaryJson,
						sleep: summary.sleepSummaryJson,
					}
				: cloneSummary(),
		};
	});
}

export async function createRoutineLogForUser(userId, babyId, input) {
	return prisma.$transaction(async (tx) => {
		const baby = await findAccessibleBaby(userId, babyId, tx);

		if (!baby) {
			return { error: "BABY_NOT_FOUND" };
		}

		const existingRow = await getExistingCreateByClientMutationId(
			tx,
			babyId,
			input.kind,
			input.clientMutationId,
		);

		if (existingRow) {
			if (input.kind === "sleep" && input.endTime) {
				const before = existingRow;
				const after = await tx.sleepSession.update({
					where: { id: existingRow.id },
					data: normalizeSleepInput(input),
				});
				const summaryDates = [
					getSummaryForStoredRow(input.kind, before, baby.timezone),
					getSummaryForStoredRow(input.kind, after, baby.timezone),
				]
					.filter(Boolean)
					.sort();
				const affectedDates = [
					getTimelineDateForStoredRow(input.kind, before, baby.timezone),
					getTimelineDateForStoredRow(input.kind, after, baby.timezone),
				]
					.filter(Boolean)
					.sort();

				await recomputeSummaries(tx, baby, summaryDates);

				return {
					event: serializeSleep(after),
					affectedDailyLogs: await getAffectedDailyLogs(tx, baby, [...new Set(affectedDates)]),
					lastLogged: await getLastLoggedForBaby(tx, baby.id),
				};
			}

			return getMutationResponseForStoredRow(tx, baby, input.kind, existingRow);
		}

		let event;
		let summaryDate;
		let timelineDate;

		if (input.kind === "meal") {
			const row = await tx.routineMealEvent.create({
				data: {
					...normalizeMealInput(input),
					babyId,
					createdById: userId,
				},
			});
			event = serializeMeal(row);
			summaryDate = summaryDateForMeal(row, baby.timezone);
			timelineDate = summaryDate;
		} else if (input.kind === "diaper") {
			const row = await tx.routineDiaperEvent.create({
				data: {
					...normalizeDiaperInput(input),
					babyId,
					createdById: userId,
				},
			});
			event = serializeDiaper(row);
			summaryDate = summaryDateForDiaper(row, baby.timezone);
			timelineDate = summaryDate;
		} else {
			if (!(await assertNoOtherActiveSleep(tx, babyId))) {
				return { error: "ACTIVE_SLEEP_EXISTS" };
			}

			const row = await tx.sleepSession.create({
				data: {
					...normalizeSleepInput(input),
					babyId,
					createdById: userId,
				},
			});
			event = serializeSleep(row);
			summaryDate = summaryDateForSleep(row, baby.timezone);
			timelineDate = getSleepRoutineDate(row, baby.timezone);
		}

		const summaryDates = summaryDate ? [summaryDate] : [];
		const affectedDates = timelineDate ? [timelineDate] : [];
		await recomputeSummaries(tx, baby, summaryDates);

		return {
			event,
			affectedDailyLogs: await getAffectedDailyLogs(tx, baby, affectedDates),
			lastLogged: await getLastLoggedForBaby(tx, baby.id),
		};
	});
}

export async function updateRoutineLogForUser(userId, babyId, kind, id, input) {
	return prisma.$transaction(async (tx) => {
		const baby = await findAccessibleBaby(userId, babyId, tx);

		if (!baby) {
			return { error: "BABY_NOT_FOUND" };
		}

		let before;
		let after;
		let event;

		if (kind === "meal") {
			before = await tx.routineMealEvent.findFirst({ where: { id, babyId } });
			if (!before) return { error: "ROUTINE_LOG_NOT_FOUND" };
			after = await tx.routineMealEvent.update({
				where: { id },
				data: normalizeMealInput({ ...input, kind }),
			});
			event = serializeMeal(after);
		} else if (kind === "diaper") {
			before = await tx.routineDiaperEvent.findFirst({ where: { id, babyId } });
			if (!before) return { error: "ROUTINE_LOG_NOT_FOUND" };
			after = await tx.routineDiaperEvent.update({
				where: { id },
				data: normalizeDiaperInput({ ...input, kind }),
			});
			event = serializeDiaper(after);
		} else {
			before = await tx.sleepSession.findFirst({ where: { id, babyId } });
			if (!before) return { error: "ROUTINE_LOG_NOT_FOUND" };
			if (!input.endTime && !(await assertNoOtherActiveSleep(tx, babyId, id))) {
				return { error: "ACTIVE_SLEEP_EXISTS" };
			}
			after = await tx.sleepSession.update({
				where: { id },
				data: normalizeSleepInput({ ...input, kind }),
			});
			event = serializeSleep(after);
		}

		const summaryDates = [
			getSummaryForStoredRow(kind, before, baby.timezone),
			getSummaryForStoredRow(kind, after, baby.timezone),
		]
			.filter(Boolean)
			.sort();
		const affectedDates = [
			getTimelineDateForStoredRow(kind, before, baby.timezone),
			getTimelineDateForStoredRow(kind, after, baby.timezone),
		]
			.filter(Boolean)
			.sort();

		await recomputeSummaries(tx, baby, summaryDates);

		return {
			event,
			affectedDailyLogs: await getAffectedDailyLogs(tx, baby, [...new Set(affectedDates)]),
			lastLogged: await getLastLoggedForBaby(tx, baby.id),
		};
	});
}

export async function deleteRoutineLogForUser(userId, babyId, kind, id) {
	return prisma.$transaction(async (tx) => {
		const baby = await findAccessibleBaby(userId, babyId, tx);

		if (!baby) {
			return { error: "BABY_NOT_FOUND" };
		}

		let before;

		if (kind === "meal") {
			before = await tx.routineMealEvent.findFirst({ where: { id, babyId } });
			if (!before) return { error: "ROUTINE_LOG_NOT_FOUND" };
			await tx.routineMealEvent.delete({ where: { id } });
		} else if (kind === "diaper") {
			before = await tx.routineDiaperEvent.findFirst({ where: { id, babyId } });
			if (!before) return { error: "ROUTINE_LOG_NOT_FOUND" };
			await tx.routineDiaperEvent.delete({ where: { id } });
		} else {
			before = await tx.sleepSession.findFirst({ where: { id, babyId } });
			if (!before) return { error: "ROUTINE_LOG_NOT_FOUND" };
			await tx.sleepSession.delete({ where: { id } });
		}

		const summaryDate = getSummaryForStoredRow(kind, before, baby.timezone);
		const timelineDate = getTimelineDateForStoredRow(kind, before, baby.timezone);
		const summaryDates = summaryDate ? [summaryDate] : [];
		const affectedDates = timelineDate ? [timelineDate] : [];
		await recomputeSummaries(tx, baby, summaryDates);

		return {
			deleted: true,
			affectedDailyLogs: await getAffectedDailyLogs(tx, baby, affectedDates),
			lastLogged: await getLastLoggedForBaby(tx, baby.id),
		};
	});
}
