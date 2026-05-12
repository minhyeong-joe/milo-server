import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";
import { errorHandler, notFoundHandler } from "./src/http/errors.js";

dotenv.config({ path: ".env.dev" });
dotenv.config();

const [
	{ default: authRouter },
	{ default: babiesRouter },
	{ default: diaryRouter },
	{ default: growthRouter },
	{ default: routineRouter },
	{ default: tagsRouter },
	{ default: prisma },
] = await Promise.all([
	import("./src/routes/auth.js"),
	import("./src/routes/babies.js"),
	import("./src/routes/diary.js"),
	import("./src/routes/growth.js"),
	import("./src/routes/routine.js"),
	import("./src/routes/tags.js"),
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
		return res.status(503).json({
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
app.use("/api/babies/:babyId/diaries", diaryRouter);
app.use("/api/babies/:babyId/growth", growthRouter);
app.use("/api/babies/:babyId/routine", routineRouter);
app.use("/api/babies/:babyId/tags", tagsRouter);
app.use("/api/babies", babiesRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`);
});
