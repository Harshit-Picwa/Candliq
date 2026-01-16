import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./replit_integrations/auth";
import { extractCompetenciesAndQuestions, generateFollowUpSuggestions, generateInterviewReport } from "./services/gemini";
import { transcribeAudio } from "./services/whisper";
import type { TranscriptEntry, InterviewNotes } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  app.get("/api/projects", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      
      const projects = await storage.getProjectsByUser(userId);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", isAuthenticated, async (req, res) => {
    try {
      const project = await storage.getProject(parseInt(req.params.id));
      if (!project) return res.status(404).json({ error: "Project not found" });
      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      
      const { title } = req.body;
      if (!title) return res.status(400).json({ error: "Title is required" });
      
      const project = await storage.createProject({ userId, title });
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", isAuthenticated, async (req, res) => {
    try {
      const project = await storage.updateProject(parseInt(req.params.id), req.body);
      if (!project) return res.status(404).json({ error: "Project not found" });
      res.json(project);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteProject(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  app.post("/api/projects/:id/generate-questions", isAuthenticated, async (req, res) => {
    try {
      console.log("[generate-questions] Starting for project:", req.params.id);
      const project = await storage.getProject(parseInt(req.params.id));
      if (!project) return res.status(404).json({ error: "Project not found" });
      if (!project.jdText) return res.status(400).json({ error: "Job description is required" });

      console.log("[generate-questions] Calling Gemini with JD length:", project.jdText.length);
      const { competencies, questions } = await extractCompetenciesAndQuestions(
        project.jdText,
        project.smeNotesText || undefined
      );
      console.log("[generate-questions] Got competencies:", competencies.length, "questions:", questions.length);

      const updated = await storage.updateProject(project.id, {
        competencyRubricJson: competencies,
        screeningQuestionsJson: questions,
      });

      console.log("[generate-questions] Updated project successfully");
      res.json(updated);
    } catch (error: any) {
      console.error("[generate-questions] Error:", error?.message || error);
      console.error("[generate-questions] Full error:", error);
      res.status(500).json({ error: "Failed to generate questions", details: error?.message });
    }
  });

  app.get("/api/projects/:id/interviews", isAuthenticated, async (req, res) => {
    try {
      const interviews = await storage.getInterviewsByProject(parseInt(req.params.id));
      res.json(interviews);
    } catch (error) {
      console.error("Error fetching interviews:", error);
      res.status(500).json({ error: "Failed to fetch interviews" });
    }
  });

  app.post("/api/projects/:id/interviews", isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { candidateName, candidateEmail } = req.body;
      
      if (!candidateName) return res.status(400).json({ error: "Candidate name is required" });
      
      const interview = await storage.createInterview({
        projectId,
        candidateName,
        candidateEmail,
        status: "draft",
      });
      
      res.status(201).json(interview);
    } catch (error) {
      console.error("Error creating interview:", error);
      res.status(500).json({ error: "Failed to create interview" });
    }
  });

  app.get("/api/interviews/:id", isAuthenticated, async (req, res) => {
    try {
      const interview = await storage.getInterview(parseInt(req.params.id));
      if (!interview) return res.status(404).json({ error: "Interview not found" });
      res.json(interview);
    } catch (error) {
      console.error("Error fetching interview:", error);
      res.status(500).json({ error: "Failed to fetch interview" });
    }
  });

  app.patch("/api/interviews/:id", isAuthenticated, async (req, res) => {
    try {
      const interview = await storage.updateInterview(parseInt(req.params.id), req.body);
      if (!interview) return res.status(404).json({ error: "Interview not found" });
      res.json(interview);
    } catch (error) {
      console.error("Error updating interview:", error);
      res.status(500).json({ error: "Failed to update interview" });
    }
  });

  app.delete("/api/interviews/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteInterview(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting interview:", error);
      res.status(500).json({ error: "Failed to delete interview" });
    }
  });

  app.post("/api/interviews/:id/end", isAuthenticated, async (req, res) => {
    try {
      const interview = await storage.getInterview(parseInt(req.params.id));
      if (!interview) return res.status(404).json({ error: "Interview not found" });
      
      const project = await storage.getProject(interview.projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const notes = interview.notesJson as InterviewNotes || {
        freeformNotes: "",
        competencyRatings: {},
        questionsAsked: [],
        questionsDismissed: [],
      };

      const report = await generateInterviewReport(
        interview.candidateName,
        project.title,
        interview.transcriptJson || [],
        project.competencyRubricJson || [],
        project.screeningQuestionsJson || [],
        notes.competencyRatings || {},
        notes.freeformNotes || ""
      );

      const updated = await storage.updateInterview(interview.id, {
        status: "completed",
        reportJson: report,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error ending interview:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = request.url || "";
    
    const audioPathMatch = pathname.match(/^\/api\/interviews\/(\d+)\/audio/);
    if (audioPathMatch) {
      const interviewId = parseInt(audioPathMatch[1]);
      
      wss.handleUpgrade(request, socket, head, (ws) => {
        setupAudioWebSocket(ws, interviewId);
      });
    }
  });

  async function setupAudioWebSocket(ws: WebSocket, interviewId: number) {
    console.log(`Audio WebSocket connected for interview ${interviewId}`);
    
    let audioBuffer: Buffer[] = [];
    let processingInterval: NodeJS.Timeout | null = null;
    let transcript: TranscriptEntry[] = [];
    let lastSuggestionTime = 0;

    const interview = await storage.getInterview(interviewId);
    if (!interview) {
      ws.close(1008, "Interview not found");
      return;
    }

    const project = await storage.getProject(interview.projectId);
    if (!project) {
      ws.close(1008, "Project not found");
      return;
    }

    if (interview.transcriptJson) {
      transcript = interview.transcriptJson;
    }

    const processAudio = async () => {
      if (audioBuffer.length === 0) return;

      const audioData = Buffer.concat(audioBuffer);
      audioBuffer = [];

      try {
        const text = await transcribeAudio(audioData);
        
        if (text.trim()) {
          const entry: TranscriptEntry = {
            id: Math.random().toString(36).substring(2, 15),
            speaker: "candidate",
            text: text.trim(),
            timestamp: Date.now(),
            isFinal: true,
          };
          
          transcript.push(entry);
          
          ws.send(JSON.stringify({
            type: "transcript",
            speaker: entry.speaker,
            text: entry.text,
            isFinal: true,
          }));

          await storage.updateInterview(interviewId, {
            transcriptJson: transcript,
          });

          const now = Date.now();
          if (now - lastSuggestionTime > 30000 && transcript.length >= 3) {
            lastSuggestionTime = now;
            
            ws.send(JSON.stringify({ type: "thinking" }));
            
            const notes = interview.notesJson as InterviewNotes || { questionsAsked: [] };
            
            const suggestions = await generateFollowUpSuggestions(
              transcript,
              project.competencyRubricJson || [],
              project.screeningQuestionsJson || [],
              notes.questionsAsked || []
            );
            
            if (suggestions.length > 0) {
              ws.send(JSON.stringify({
                type: "suggestion",
                suggestions,
              }));
            }
          }
        }
      } catch (error) {
        console.error("Audio processing error:", error);
      }
    };

    processingInterval = setInterval(processAudio, 5000);

    ws.on("message", (data: Buffer) => {
      audioBuffer.push(data);
    });

    ws.on("close", async () => {
      console.log(`Audio WebSocket closed for interview ${interviewId}`);
      
      if (processingInterval) {
        clearInterval(processingInterval);
      }

      if (audioBuffer.length > 0) {
        await processAudio();
      }

      await storage.updateInterview(interviewId, {
        transcriptJson: transcript,
      });
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  }

  return httpServer;
}
