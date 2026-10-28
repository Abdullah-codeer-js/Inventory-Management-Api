import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import apiRouter from "./routes/api.js";
import errorHandler from "./middleware/error-handler.js";
import { env } from "./config/env.js";

const app = express();
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const uploadDirectory = path.join(currentDirectory, "..", "uploads");

const allowedOrigins = (env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // In development or local testing, allow any localhost/127.0.0.1 port
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(
  "/uploads",
  (request, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(uploadDirectory, { dotfiles: "deny", index: false }),
);
app.use(apiRouter);
app.use(errorHandler);

export default app;
