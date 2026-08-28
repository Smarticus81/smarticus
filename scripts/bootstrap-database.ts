import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const targetUrl = new URL(databaseUrl);
const databaseName = decodeURIComponent(targetUrl.pathname.slice(1));
if (!databaseName) throw new Error("DATABASE_URL must include a database name");

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function ensureDatabase() {
  const maintenanceUrl = new URL(targetUrl);
  maintenanceUrl.pathname = "/postgres";
  maintenanceUrl.searchParams.delete("schema");

  const client = new Client({ connectionString: maintenanceUrl.toString() });
  await client.connect();
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

  const client = new Client({ connectionString: targetUrl.toString() });
  await client.connect();
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
  const client = new Client({ connectionString: targetUrl.toString() });
  await client.connect();
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
  const { seedDatabase, disconnectSeedDatabase } = await import("../prisma/seed.js");
  try {
    await seedDatabase();
  } finally {
    await disconnectSeedDatabase();
  }
}

await ensureDatabase();
await applyMigrations();
if (process.argv.includes("--seed-if-empty")) {
  await seedIfEmpty();
}
