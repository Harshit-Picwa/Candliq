import { db } from "../db";
import { Prisma } from "@prisma/client";
import type { User, UpsertUser } from "@shared/models/auth";

// Interface for auth storage operations
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(userData: Omit<UpsertUser, "id">): Promise<User>;
  upsertUser(userData: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const user = await db.user.findUnique({
      where: { id },
    });
    return user as User | undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const user = await db.user.findUnique({
      where: { email },
    });
    return user as User | undefined;
  }

  async createUser(userData: Omit<UpsertUser, "id">): Promise<User> {
    const user = await db.user.create({
      data: userData as Prisma.UserCreateInput,
    });
    return user as User;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const user = await db.user.upsert({
      where: { id: userData.id },
      create: userData as Prisma.UserCreateInput,
      update: {
        ...userData,
        updatedAt: new Date(),
      } as Prisma.UserUpdateInput,
    });
    return user as User;
  }
}

export const authStorage = new AuthStorage();
