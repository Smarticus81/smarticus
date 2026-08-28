import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { disconnectSeedDatabase, seedDatabase } from "../prisma/seed.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const targetUrl = new URL(databaseUrl);
const databaseName = decodeURIComponent(targetUrl.pathname.slice(1));
if (!databaseName) throw new Error("DATABASE_URL must include a database name");
const MAX_CONNECTION_ATTEMPTS = 12;

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function describeDatabaseError(error: unknown): string {
  if (error instanceof AggregateError) {
    const details = error.errors
      .map((entry: unknown) => describeDatabaseError(entry))
      .filter(Boolean)
      .join("; ");
    return details || error.message || "Multiple database connection errors";
  }
  if (error instanceof Error) {
    const coded = error as Error & {
      code?: string;
      syscall?: string;
      address?: string;
      port?: number;
      cause?: unknown;
    };
    const context = [
      coded.code,
      coded.syscall,
      coded.address,
      coded.port === undefined ? undefined : String(coded.port),
    ].filter(Boolean);
    const primary = [coded.message, context.length ? `(${context.join(" ")})` : undefined]
      .filter(Boolean)
      .join(" ");
    if (primary) return primary;
    if (coded.cause) return describeDatabaseError(coded.cause);
    return error.name;
  }
  return String(error);
}

function retryDelay(attempt: number) {
  return Math.min(1_000 * 2 ** (attempt - 1), 5_000);
}

async function connectWithRetry(connectionString: string, label: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_CONNECTION_ATTEMPTS; attempt += 1) {
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 5_000,
    });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      const detail = describeDatabaseError(error);
      if (attempt === MAX_CONNECTION_ATTEMPTS) break;
      console.warn(
        `Waiting for ${label} (${attempt}/${MAX_CONNECTION_ATTEMPTS}): ${detail}`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
    }
  }
  throw new Error(
    `Unable to connect to ${label} after ${MAX_CONNECTION_ATTEMPTS} attempts: ${describeDatabaseError(lastError)}`,
  );
}

async function ensureDatabase() {
  const maintenanceUrl = new URL(targetUrl);
  maintenanceUrl.pathname = "/postgres";
  maintenanceUrl.searchParams.delete("schema");

  const client = await connectWithRetry(
    maintenanceUrl.toString(),
    "PostgreSQL maintenance database",
  );
  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      databaseName,
    ]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
      console.log(`Created PostgreSQL database ${databaseName}.`);
    }
  } finally {
    await client.end();
  }
}

async function applyMigrations() {
  const migrationsRoot = path.join(process.cwd(), "prisma", "migrations");
  const entries = await readdir(migrationsRoot, { withFileTypes: true });
  const migrationNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const client = await connectWithRetry(targetUrl.toString(), "PostgreSQL");
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" VARCHAR(36) PRIMARY KEY NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      )
    `);

    for (const migrationName of migrationNames) {
      const migrationBytes = await readFile(
        path.join(migrationsRoot, migrationName, "migration.sql"),
      );
      const checksum = createHash("sha256").update(migrationBytes).digest("hex");
      const sql =
        migrationBytes[0] === 0xff && migrationBytes[1] === 0xfe
          ? migrationBytes.toString("utf16le").replace(/^\uFEFF/, "")
          : migrationBytes.toString("utf8").replace(/^\uFEFF/, "");
      const previous = await client.query<{
        checksum: string;
        finished_at: Date | null;
        rolled_back_at: Date | null;
      }>(
        `SELECT "checksum", "finished_at", "rolled_back_at"
         FROM "_prisma_migrations" WHERE "migration_name" = $1
         ORDER BY "started_at" DESC LIMIT 1`,
        [migrationName],
      );

      if (previous.rowCount) {
        const record = previous.rows[0];
        if (record.checksum !== checksum) {
          throw new Error(`Migration checksum mismatch: ${migrationName}`);
        }
        if (record.finished_at && !record.rolled_back_at) continue;
        throw new Error(`Migration requires manual recovery: ${migrationName}`);
      }

      await client.query("BEGIN");
      try {
        const id = randomUUID();
        await client.query(
          `INSERT INTO "_prisma_migrations"
            ("id", "checksum", "migration_name", "started_at", "applied_steps_count")
           VALUES ($1, $2, $3, now(), 0)`,
          [id, checksum, migrationName],
        );
        await client.query(sql);
        await client.query(
          `UPDATE "_prisma_migrations"
           SET "finished_at" = now(), "applied_steps_count" = 1 WHERE "id" = $1`,
          [id],
        );
        await client.query("COMMIT");
        console.log(`Applied migration ${migrationName}.`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

async function seedIfEmpty() {
  const client = await connectWithRetry(targetUrl.toString(), "PostgreSQL");
  let ready = false;
  try {
    const result = await client.query<{ ready: boolean }>(`
      SELECT
        EXISTS (SELECT 1 FROM "Student" LIMIT 1)
        AND EXISTS (SELECT 1 FROM "Lesson" LIMIT 1) AS ready
    `);
    ready = result.rows[0]?.ready ?? false;
  } finally {
    await client.end();
  }

  if (ready) return;

  console.log("Production database is empty; loading the initial curriculum.");
  try {
    await seedDatabase();
  } finally {
    await disconnectSeedDatabase();
  }
}

export async function bootstrapDatabase(
  options: { ensureDatabase?: boolean; seedIfEmpty?: boolean } = {},
) {
  if (options.ensureDatabase !== false) {
    await ensureDatabase();
  }
  await applyMigrations();
  if (options.seedIfEmpty) {
    await seedIfEmpty();
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  bootstrapDatabase({ seedIfEmpty: process.argv.includes("--seed-if-empty") }).catch(
    (error) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
