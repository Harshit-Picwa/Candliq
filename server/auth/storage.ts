import { db } from "../db";
import { Prisma } from "@prisma/client";
import type { User, UpsertUser } from "@shared/models/auth";

// Interface for auth storage operations
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(userData: Omit<UpsertUser, "id">): Promise<User>;
  upsertUser(userData: UpsertUser): Promise<User>;
  updateUser(id: string, userData: Partial<Omit<User, "id" | "email" | "passwordHash" | "createdAt" | "updatedAt">>): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const user = await db.user.findUnique({
      where: { id },
    });
    return user as User | undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const user = await db.user.findFirst({
      where: { 
        email: {
          equals: email,
          mode: 'insensitive'
        }
      },
    });
    return user as User | undefined;
  }

  async createUser(userData: Omit<UpsertUser, "id">): Promise<User> {
    // Prevent creation of dev@localhost user
    if (userData.email === "dev@localhost" || userData.email?.toLowerCase() === "dev@localhost") {
      throw new Error("Cannot create dev@localhost user. This email is reserved.");
    }
    
    console.log(`[auth/storage] Creating user with email: ${userData.email}`);
    const user = await db.user.create({
      data: userData as Prisma.UserCreateInput,
    });
    console.log(`[auth/storage] User created: ${user.id} (${user.email})`);
    return user as User;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Prevent creation/update of dev@localhost user
    if (userData.email === "dev@localhost" || userData.email?.toLowerCase() === "dev@localhost") {
      throw new Error("Cannot create or update dev@localhost user. This email is reserved.");
    }
    
    console.log(`[auth/storage] Upserting user with email: ${userData.email}`);
    const user = await db.user.upsert({
      where: { id: userData.id },
      create: userData as Prisma.UserCreateInput,
      update: {
        ...userData,
        updatedAt: new Date(),
      } as Prisma.UserUpdateInput,
    });
    console.log(`[auth/storage] User upserted: ${user.id} (${user.email})`);
    return user as User;
  }

  async updateUser(id: string, userData: Partial<Omit<User, "id" | "email" | "passwordHash" | "createdAt" | "updatedAt">>): Promise<User> {
    console.log(`[auth/storage] Updating user: ${id}`);
    const user = await db.user.update({
      where: { id },
      data: {
        ...userData,
        updatedAt: new Date(),
      } as Prisma.UserUpdateInput,
    });
    return user as User;
  }
}

export const authStorage = new AuthStorage();
