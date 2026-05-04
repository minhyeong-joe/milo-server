import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";

dotenv.config({ path: ".env.dev" });
dotenv.config();

const [{ default: authRouter }, { default: prisma }] = await Promise.all([
	import("./src/routes/auth.js"),
	import("./src/db/prisma.js"),
]);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === "prod" ? "combined" : "dev"));

app.get("/", (req, res) => {
	res.json({
		message: "Milo API is running",
		status: "ok",
	});
});

app.get("/health", async (req, res) => {
	try {
		await prisma.$queryRaw`SELECT 1`;

		res.json({
			status: "ok",
			uptime: process.uptime(),
			database: {
				status: "ok",
			},
		});
	} catch (error) {
		console.error("Database connection error:", error);
		res.status(503).json({
			status: "error",
			uptime: process.uptime(),
			database: {
				status: "error",
			},
			error: {
				code: "DATABASE_CONNECTION_ERROR",
				message: "Unable to connect to the database.",
				details: {},
			},
		});
	}
});

app.use("/api/auth", authRouter);

app.use((req, res) => {
	res.status(404).json({
		error: {
			code: "NOT_FOUND",
			message: "Not found",
			details: {},
		},
	});
});

app.use((err, req, res, next) => {
	console.error(err);
	res.status(err.status || 500).json({
		error: {
			code: "INTERNAL_SERVER_ERROR",
			message:
				process.env.NODE_ENV === "prod" ? "Internal server error" : err.message,
			details: {},
		},
	});
});

app.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`);
});
