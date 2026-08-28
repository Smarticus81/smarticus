import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env.js";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

let _prismaClient: PrismaClient | undefined = globalForPrisma.prisma;

function getPrismaClient() {
  if (!_prismaClient) _prismaClient = createPrismaClient();
  return _prismaClient;
}

// Export a proxy so other modules can import `prisma` as before,
// but the actual PrismaClient is only instantiated on first access.
export const prisma = new Proxy(
  {} as PrismaClient,
  {
    get(_target, prop) {
      const client = getPrismaClient();
      const value = Reflect.get(client, prop, client) as unknown;
      return typeof value === "function" ? value.bind(client) : value;
    },
  },
);

export async function disconnectPrisma() {
  if (!_prismaClient) return;
  await _prismaClient.$disconnect();
  _prismaClient = undefined;
}
