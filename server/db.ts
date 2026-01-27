import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Create base Prisma client
const basePrisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});

// Wrap Prisma client to intercept user creation and prevent dev@localhost
const prismaWithInterception = new Proxy(basePrisma, {
  get(target, prop) {
    if (prop === "user") {
      return new Proxy(target.user, {
        get(userTarget: any, userProp: string | symbol) {
          if (userProp === "create") {
            return async (args: any) => {
              // Intercept user creation
              if (args?.data?.email === "dev@localhost" || args?.data?.email?.toLowerCase() === "dev@localhost") {
                console.error("[db] 🚫 BLOCKED: Attempt to create dev@localhost user via direct db.user.create()");
                console.error("[db] Stack trace:", new Error().stack);
                throw new Error("Cannot create dev@localhost user. This email is reserved. Use authStorage.createUser() instead.");
              }
              console.log(`[db] Creating user via direct db.user.create(): ${args?.data?.email}`);
              return userTarget.create(args);
            };
          }
          if (userProp === "upsert") {
            return async (args: any) => {
              // Intercept user upsert
              if (args?.create?.email === "dev@localhost" || args?.create?.email?.toLowerCase() === "dev@localhost" ||
                  args?.update?.email === "dev@localhost" || args?.update?.email?.toLowerCase() === "dev@localhost") {
                console.error("[db] 🚫 BLOCKED: Attempt to upsert dev@localhost user via direct db.user.upsert()");
                console.error("[db] Stack trace:", new Error().stack);
                throw new Error("Cannot create or update dev@localhost user. This email is reserved. Use authStorage.upsertUser() instead.");
              }
              console.log(`[db] Upserting user via direct db.user.upsert(): ${args?.create?.email || args?.update?.email}`);
              return userTarget.upsert(args);
            };
          }
          return userTarget[userProp];
        },
      });
    }
    return target[prop as keyof typeof target];
  },
});

export const db =
  globalForPrisma.prisma ??
  prismaWithInterception;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
