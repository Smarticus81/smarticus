import "dotenv/config";
import express from "express";
import helmet from "helmet";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import compression from "compression";
import { rateLimit } from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { env } from "./config/env.js";
import { requestContextMiddleware } from "./lib/logger.js";
import { errorHandler } from "./middleware/http.js";
import { apiRouter } from "./routes/api.js";
import { realtimeRouter } from "./routes/special.js";
import { log } from "./lib/logger.js";
import {
  ingestAllCurriculum,
  ingestDailyCurriculum,
} from "./ingest/curriculum.js";
import { disconnectPrisma, prisma } from "./lib/prisma.js";
import { authRouter, requireAuthentication } from "./routes/auth.js";
import {
  bootstrapDatabase,
  describeDatabaseError,
} from "../scripts/bootstrap-database.js";

const PostgresSessionStore = connectPgSimple(session);
let sessionPool: Pool | undefined;

function createSessionStore() {
  if (env.NODE_ENV !== "production") return undefined;
  sessionPool ??= new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  return new PostgresSessionStore({
    pool: sessionPool,
    createTableIfMissing: false,
    pruneSessionInterval: 15 * 60,
    errorLog: (error) =>
      log({ level: "error", message: "Session store error", error: String(error) }),
  });
}

async function disconnectSessionStore() {
  if (!sessionPool) return;
  const pool = sessionPool;
  sessionPool = undefined;
  await pool.end();
}

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          connectSrc: ["'self'", "https://api.openai.com", "wss://api.openai.com"],
          fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", "data:", "blob:"],
          mediaSrc: ["'self'", "blob:"],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          workerSrc: ["'self'", "blob:"],
        },
      },
    }),
  );
  app.use(compression());
  app.use(requestContextMiddleware);

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: "atticus-tutor",
    });
  });

  app.get("/ready", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: "ready" });
    } catch (error) {
      log({
        level: "error",
        message: "Readiness check failed",
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(503).json({ status: "unavailable" });
    }
  });

  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: true, limit: "100kb" }));
  app.use(
    session({
      name: "atticus.sid",
      store: createSessionStore(),
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
        maxAge: env.SESSION_MAX_AGE_MS,
      },
    }),
  );

  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "Too many requests; please try again shortly." },
    }),
    (_req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      next();
    },
  );

  app.use(
    "/api/realtime/client-secret",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "Too many voice-session requests; please try again shortly." },
    }),
  );

  app.use(
    "/api/auth/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 5,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      message: { error: "Too many login attempts; please try again shortly." },
    }),
  );

  app.use("/api/auth", authRouter);
  app.use("/api", requireAuthentication);
  app.use("/api/realtime", realtimeRouter);
  app.use("/api", apiRouter);

  app.use("/api", (req, res) => {
    res.status(404).json({ error: "API route not found", requestId: req.ctx.requestId });
  });

  const clientDist = path.join(process.cwd(), "client/dist");
  app.use(
    express.static(clientDist, {
      maxAge: env.NODE_ENV === "production" ? "1y" : 0,
      immutable: env.NODE_ENV === "production",
      setHeaders: (res, filePath) => {
        if (path.basename(filePath) === "index.html") {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path === "/health" || req.path === "/ready") return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(clientDist, "index.html"), (err) => {
      if (err) next(err);
    });
  });

  app.use(errorHandler);
  return app;
}

async function syncCurriculumInBackground() {
  if (env.NODE_ENV !== "production" && !env.AUTO_INGEST_CURRICULUM) return;
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

async function syncDailyCurriculumBeforeStart() {
  if (env.NODE_ENV !== "production" && !env.AUTO_INGEST_CURRICULUM) return;
  try {
    const results = await ingestDailyCurriculum();
    log({
      message: "Daily curriculum ready",
      toolOutcome: "success",
      resultCount: results.length,
    });
  } catch (error) {
    log({
      level: "error",
      message: "Pre-start daily curriculum sync failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function startServer() {
  const app = createApp();
  const host = "0.0.0.0";
  const port = env.PORT;

  const server = app.listen(port, host, () => {
    log({ message: "Atticus Tutor server started", port, host, nodeEnv: env.NODE_ENV });
    void syncCurriculumInBackground();
  });
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 120_000;

  return server;
}

async function registerShutdownHandlers() {
  await bootstrapDatabase({ ensureDatabase: false, seedIfEmpty: true });
  await syncDailyCurriculumBeforeStart();

  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log({ message: "Graceful shutdown started", signal });

    const forceExitTimer = setTimeout(() => {
      log({ level: "error", message: "Graceful shutdown timed out" });
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    server.close(async (error) => {
      try {
        await Promise.all([disconnectPrisma(), disconnectSessionStore()]);
      } finally {
        clearTimeout(forceExitTimer);
      }
      if (error) {
        log({ level: "error", message: "HTTP server shutdown failed", error: error.message });
        process.exit(1);
      }
      log({ message: "Graceful shutdown completed" });
      process.exit(0);
    });
  };

  const server = startServer();
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  registerShutdownHandlers().catch((error) => {
    const detail = describeDatabaseError(error);
    log({
      level: "error",
      message: `Database initialization failed: ${detail}`,
      error: detail,
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  });
}
