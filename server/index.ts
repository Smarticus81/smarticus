import "dotenv/config";
import express from "express";
import helmet from "helmet";
import session from "express-session";
import path from "path";
import { env } from "./config/env.js";
import { requestContextMiddleware } from "./lib/logger.js";
import { errorHandler } from "./middleware/http.js";
import { apiRouter } from "./routes/api.js";
import { realtimeRouter } from "./routes/special.js";
import { log } from "./lib/logger.js";
import { ingestAllCurriculum } from "./ingest/curriculum.js";

export function createApp() {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(requestContextMiddleware);
  app.use(
    session({
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: true,
      cookie: {
        secure: env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: "atticus-tutor",
    });
  });

  app.use("/api/realtime", realtimeRouter);
  app.use("/api", apiRouter);

  const clientDist = path.join(process.cwd(), "client/dist");
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path === "/health") return next();
    res.sendFile(path.join(clientDist, "index.html"), (err) => {
      if (err) next();
    });
  });

  app.use(errorHandler);
  return app;
}

async function syncCurriculumInBackground() {
  if (!env.AUTO_INGEST_CURRICULUM) return;
  try {
    const results = await ingestAllCurriculum();
    log({
      message: "Automatic curriculum sync completed",
      toolOutcome: "success",
      resultCount: results.length,
    });
  } catch (error) {
    // The voice service should remain available even if an external vector store
    // or database migration is temporarily unavailable. The error remains visible
    // in server logs and the deterministic CLI can be rerun after the dependency recovers.
    log({
      level: "error",
      message: "Automatic curriculum sync failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function startServer() {
  const app = createApp();
  const host = "0.0.0.0";
  const port = env.PORT;

  app.listen(port, host, () => {
    log({ message: "Atticus Tutor server started", port, host, nodeEnv: env.NODE_ENV });
    void syncCurriculumInBackground();
  });

  return app;
}

const isMain = process.argv[1] && (
  process.argv[1].endsWith("server/index.js") ||
  process.argv[1].endsWith("server\\index.js") ||
  process.argv[1].endsWith("server/server/index.js") ||
  process.argv[1].endsWith("server\\server\\index.js") ||
  process.argv[1].endsWith("server/index.ts")
);

if (isMain) {
  startServer();
}
