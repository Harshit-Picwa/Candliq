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

  private static readonly PROJECT_UPDATE_KEYS = [
    "title",
    "jdText",
    "smeNotesText",
    "companyWebsite",
    "interviewDuration",
    "screeningQuestionsJson",
    "competencyRubricJson",
  ] as const;

  async updateProject(id: number, data: Partial<Project>): Promise<Project | undefined> {
    const raw = data as Record<string, unknown>;
    const payload: Prisma.ProjectUpdateInput = { updatedAt: new Date() };
    if (Object.prototype.hasOwnProperty.call(raw, "title")) payload.title = raw.title as string;
    if (Object.prototype.hasOwnProperty.call(raw, "jdText")) payload.jdText = raw.jdText as string | null;
    if (Object.prototype.hasOwnProperty.call(raw, "smeNotesText")) payload.smeNotesText = raw.smeNotesText as string | null;
    if (Object.prototype.hasOwnProperty.call(raw, "companyWebsite")) payload.companyWebsite = raw.companyWebsite as string | null;
    if (Object.prototype.hasOwnProperty.call(raw, "interviewDuration")) payload.interviewDuration = raw.interviewDuration as number | null;
    if (Object.prototype.hasOwnProperty.call(raw, "screeningQuestionsJson")) payload.screeningQuestionsJson = raw.screeningQuestionsJson as Prisma.InputJsonValue;
    if (Object.prototype.hasOwnProperty.call(raw, "competencyRubricJson")) payload.competencyRubricJson = raw.competencyRubricJson as Prisma.InputJsonValue;
    const updated = await db.project.update({
      where: { id },
      data: payload,
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
    const transcriptJson =
      interview.transcriptJson === null
        ? Prisma.JsonNull
        : interview.transcriptJson === undefined
        ? undefined
        : (interview.transcriptJson as unknown as Prisma.InputJsonValue);
    const reportJson =
      interview.reportJson === null
        ? Prisma.JsonNull
        : interview.reportJson === undefined
        ? undefined
        : (interview.reportJson as unknown as Prisma.InputJsonValue);
    const notesJson =
      interview.notesJson === null
        ? Prisma.JsonNull
        : interview.notesJson === undefined
        ? undefined
        : (interview.notesJson as unknown as Prisma.InputJsonValue);
    const created = await db.interview.create({
      data: {
        project: { connect: { id: interview.projectId } },
        candidateName: interview.candidateName,
        candidateEmail: interview.candidateEmail ?? undefined,
        resumeText: interview.resumeText ?? undefined,
        transcriptJson,
        reportJson,
        notesJson,
        status: interview.status ?? "draft",
        consentGiven: interview.consentGiven ?? false,
      },
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
