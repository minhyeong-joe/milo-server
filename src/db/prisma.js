import { PrismaPg } from "@prisma/adapter-pg";
import prismaClientPkg from "@prisma/client";
import pg from "pg";

const { PrismaClient } = prismaClientPkg;

if (!process.env.DATABASE_URL) {
	throw new Error("DATABASE_URL is required to initialize Prisma.");
}

const { Pool } = pg;
const globalForPrisma = globalThis;

const connectionString = process.env.DATABASE_URL;

const pool =
	globalForPrisma.__miloPgPool ??
	new Pool({
		connectionString: connectionString,
	});

const adapter = globalForPrisma.__miloPrismaAdapter ?? new PrismaPg(pool);

const prisma =
	globalForPrisma.__miloPrisma ??
	new PrismaClient({
		adapter,
	});

if (process.env.NODE_ENV !== "prod") {
	globalForPrisma.__miloPgPool = pool;
	globalForPrisma.__miloPrismaAdapter = adapter;
	globalForPrisma.__miloPrisma = prisma;
}

export default prisma;
