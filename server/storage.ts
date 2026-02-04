import { db } from "./db";
import { Prisma } from "@prisma/client";
import type {
  Project,
  Interview,
  InsertProject,
  InsertInterview,
} from "@shared/schema";

/** Map Prisma project (aiChatHistory) to Project type (aiChatHistoryJson). */
function toProject(row: { aiChatHistory?: unknown;[key: string]: unknown }): Project {
  const { aiChatHistory, ...rest } = row;
  // Handle potential case mismatches between DB/Prisma row and the Project type
  // 'status' is included in 'rest' and matches the Project type directly
  const result = { ...rest, aiChatHistoryJson: aiChatHistory ?? null } as any;

  if (result.total_minutes !== undefined && result.totalMinutes === undefined) {
    result.totalMinutes = result.total_minutes;
  }
  if (result.interview_duration !== undefined && result.interviewDuration === undefined) {
    result.interviewDuration = result.interview_duration;
  }
  if (result.intro_minutes !== undefined && result.introMinutes === undefined) {
    result.introMinutes = result.intro_minutes;
  }
  if (result.closure_minutes !== undefined && result.closureMinutes === undefined) {
    result.closureMinutes = result.closure_minutes;
  }

  return result as Project;
}

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
    return projects.map(toProject);
  }

  async getProject(id: number): Promise<Project | undefined> {
    const project = await db.project.findUnique({
      where: { id },
    });
    return project ? toProject(project) : undefined;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const created = await db.project.create({
      data: project as Prisma.ProjectCreateInput,
    });
    return toProject(created);
  }

  private static readonly PROJECT_UPDATE_KEYS = [
    "title",
    "jdText",
    "smeNotesText",
    "companyWebsite",
    "locationCity",
    "locationState",
    "locationCountry",
    "interviewDuration",
    "introMinutes",
    "closureMinutes",
    "totalMinutes",
    "screeningQuestionsJson",
    "competencyRubricJson",
    "aiChatHistoryJson",
  ] as const;

  async updateProject(id: number, data: Partial<Project>): Promise<Project | undefined> {
    const raw = data as Record<string, unknown>;
    const payload: Prisma.ProjectUpdateInput = { updatedAt: new Date() };
    if (Object.prototype.hasOwnProperty.call(raw, "title")) payload.title = raw.title as string;
    if (Object.prototype.hasOwnProperty.call(raw, "jdText")) payload.jdText = raw.jdText as string | null;
    if (Object.prototype.hasOwnProperty.call(raw, "smeNotesText")) payload.smeNotesText = raw.smeNotesText as string | null;
    if (Object.prototype.hasOwnProperty.call(raw, "companyWebsite")) payload.companyWebsite = raw.companyWebsite as string | null;
    if (Object.prototype.hasOwnProperty.call(raw, "locationCity")) (payload as Record<string, unknown>).locationCity = raw.locationCity as string | null;
    if (Object.prototype.hasOwnProperty.call(raw, "locationState")) (payload as Record<string, unknown>).locationState = raw.locationState as string | null;
    if (Object.prototype.hasOwnProperty.call(raw, "locationCountry")) (payload as Record<string, unknown>).locationCountry = raw.locationCountry as string | null;
    if (Object.prototype.hasOwnProperty.call(raw, "interviewDuration")) payload.interviewDuration = raw.interviewDuration as number | null;
    if (Object.prototype.hasOwnProperty.call(raw, "introMinutes")) payload.introMinutes = raw.introMinutes as number | null;
    if (Object.prototype.hasOwnProperty.call(raw, "closureMinutes")) payload.closureMinutes = raw.closureMinutes as number | null;
    // Total Interview Time (min) - persisted to DB (Prisma schema uses camelCase totalMinutes)
    if (Object.prototype.hasOwnProperty.call(raw, "totalMinutes")) {
      const val = raw.totalMinutes;
      payload.totalMinutes = val === null || val === undefined ? null : Number(val);
    } else if (Object.prototype.hasOwnProperty.call(raw, "total_minutes")) {
      // Accept snake_case from client but map to camelCase for Prisma
      const val = raw.total_minutes;
      payload.totalMinutes = val === null || val === undefined ? null : Number(val);
    }
    if (Object.prototype.hasOwnProperty.call(raw, "screeningQuestionsJson")) payload.screeningQuestionsJson = raw.screeningQuestionsJson as Prisma.InputJsonValue;
    if (Object.prototype.hasOwnProperty.call(raw, "competencyRubricJson")) payload.competencyRubricJson = raw.competencyRubricJson as Prisma.InputJsonValue;
    if (Object.prototype.hasOwnProperty.call(raw, "aiChatHistoryJson")) payload.aiChatHistory = raw.aiChatHistoryJson as Prisma.InputJsonValue;
    if (Object.prototype.hasOwnProperty.call(raw, "status")) (payload as any).status = raw.status as string;
    if (Object.prototype.hasOwnProperty.call(raw, "questionsStep")) (payload as any).questionsStep = raw.questionsStep as string | null;

    // Prisma only accepts camelCase totalMinutes; ensure snake_case never reaches it
    const payloadData = payload as Record<string, unknown>;
    if ("total_minutes" in payloadData) delete payloadData.total_minutes;

    const updated = await db.project.update({
      where: { id },
      data: payload as Prisma.ProjectUpdateInput,
    });
    return toProject(updated);
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
