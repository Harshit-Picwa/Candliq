import { db } from "./db";
import { Prisma } from "@prisma/client";
import type {
  Project,
  Interview,
  InsertProject,
  InsertInterview,
} from "@shared/schema";

export interface IStorage {
  getProjectsByUser(userId: string): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, project: Partial<Project>): Promise<Project | undefined>;
  deleteProject(id: number): Promise<void>;
  
  getInterviewsByProject(projectId: number): Promise<Interview[]>;
  getInterview(id: number): Promise<Interview | undefined>;
  createInterview(interview: InsertInterview): Promise<Interview>;
  updateInterview(id: number, interview: Partial<Interview>): Promise<Interview | undefined>;
  deleteInterview(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getProjectsByUser(userId: string): Promise<Project[]> {
    const projects = await db.project.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return projects as Project[];
  }

  async getProject(id: number): Promise<Project | undefined> {
    const project = await db.project.findUnique({
      where: { id },
    });
    return project as Project | undefined;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const created = await db.project.create({
      data: project as Prisma.ProjectCreateInput,
    });
    return created as Project;
  }

  async updateProject(id: number, data: Partial<Project>): Promise<Project | undefined> {
    const updated = await db.project.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      } as Prisma.ProjectUpdateInput,
    });
    return updated as Project | undefined;
  }

  async deleteProject(id: number): Promise<void> {
    await db.project.delete({
      where: { id },
    });
  }

  async getInterviewsByProject(projectId: number): Promise<Interview[]> {
    const interviews = await db.interview.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
    return interviews as Interview[];
  }

  async getInterview(id: number): Promise<Interview | undefined> {
    const interview = await db.interview.findUnique({
      where: { id },
    });
    return interview as Interview | undefined;
  }

  async createInterview(interview: InsertInterview): Promise<Interview> {
    const created = await db.interview.create({
      data: interview as Prisma.InterviewCreateInput,
    });
    return created as Interview;
  }

  async updateInterview(id: number, data: Partial<Interview>): Promise<Interview | undefined> {
    const updated = await db.interview.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      } as Prisma.InterviewUpdateInput,
    });
    return updated as Interview | undefined;
  }

  async deleteInterview(id: number): Promise<void> {
    await db.interview.delete({
      where: { id },
    });
  }
}

export const storage = new DatabaseStorage();
