import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import api from "./routes.js";

const app = express();
const clientUrls = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  ...(process.env.CLIENT_URL ? [process.env.CLIENT_URL] : []),
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || clientUrls.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
}));
app.use(express.json({ limit: "5mb" }));
app.use("/api", api);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  console.error("API request failed:", error);
  res.status(500).json({ error: message });
};

app.use(errorHandler);

export default app;
