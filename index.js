import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.get("/", (req, res) => {
	res.json({
		message: "Milo API is running",
		status: "ok",
	});
});

app.get("/health", (req, res) => {
	res.json({
		status: "ok",
		uptime: process.uptime(),
	});
});

app.use((req, res) => {
	res.status(404).json({
		error: "Not found",
	});
});

app.use((err, req, res, next) => {
	console.error(err);
	res.status(err.status || 500).json({
		error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
	});
});

app.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`);
});
