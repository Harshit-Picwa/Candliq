import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./auth";
import { extractCompetenciesAndQuestions, regenerateQuestionsWithInstructions, generateFollowUpSuggestions, generateInterviewReport, evaluateAnswerQuality, refineIndividualQuestion, refineMultipleQuestions, refineJobDescription } from "./services/gemini";
import { transcribeAudio, detectSpeaker } from "./services/whisper";
import type { TranscriptEntry, InterviewNotes, ScreeningQuestion, Project } from "@shared/schema";

// Extend Express.User type to include our user properties
declare global {
  namespace Express {
    interface User {
      id: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      profileImageUrl?: string;
    }
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  app.get("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      console.log("[get-projects] req.user:", JSON.stringify(req.user));
      console.log("[get-projects] req.user?.id:", req.user?.id);
      if (!req.user || !req.user.id) {
        console.error("[get-projects] req.user or req.user.id is missing");
        return res.status(401).json({ error: "Unauthorized" });
      }
      const userId = req.user.id;
      const projects = await storage.getProjectsByUser(userId);
      res.json(projects);
    } catch (error) {
      console.error("[get-projects] Error:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", isAuthenticated, async (req, res) => {
    try {
      const project = await storage.getProject(parseInt(req.params.id));
      if (!project) return res.status(404).json({ error: "Project not found" });
      console.log("[get-project] ID:", req.params.id, "Status:", project.status, "QuestionsStep:", (project as any).questionsStep);
      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      console.log("[create-project] req.isAuthenticated():", req.isAuthenticated());
      console.log("[create-project] req.user:", JSON.stringify(req.user));
      console.log("[create-project] req.user?.id:", req.user?.id);
      console.log("[create-project] req.session:", req.session ? "exists" : "missing");
      console.log("[create-project] req.cookies:", JSON.stringify(req.cookies));
      if (!req.user || !req.user.id) {
        console.error("[create-project] req.user or req.user.id is missing");
        return res.status(401).json({ error: "Unauthorized" });
      }
      const userId = req.user.id;
      const { title, totalMinutes, interviewDuration } = req.body;
      if (!title) return res.status(400).json({ error: "Title is required" });

      const project = await storage.createProject({
        userId,
        title,
        ...(totalMinutes != null && totalMinutes !== "" && { totalMinutes: Number(totalMinutes) || undefined }),
        ...(interviewDuration != null && interviewDuration !== "" && { interviewDuration: Number(interviewDuration) || undefined }),
      });
      res.status(201).json(project);
    } catch (error) {
      console.error("[create-project] Error:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", isAuthenticated, async (req, res) => {
    try {
      const body = { ...req.body } as Record<string, unknown>;
      const allowed = [
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
        "status",
        "questionsStep",
      ] as const;
      const payload: Record<string, unknown> = {};
      for (const k of allowed) {
        if (Object.prototype.hasOwnProperty.call(body, k)) {
          payload[k] = body[k];
        }
      }
      console.log("[patch-project] ID:", req.params.id, "Payload:", { status: payload.status, questionsStep: payload.questionsStep });
      const project = await storage.updateProject(parseInt(req.params.id), payload as any);
      if (!project) return res.status(404).json({ error: "Project not found" });
      console.log("[patch-project] Updated project:", { status: project.status, questionsStep: (project as any).questionsStep });
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
      if (!project.jdText || project.jdText.trim().length === 0) {
        console.log("[generate-questions] Missing JD text. Project:", JSON.stringify({ id: project.id, hasJdText: !!project.jdText, jdTextLength: project.jdText?.length || 0 }));
        return res.status(400).json({ error: "Job description is required. Please add a job description before generating questions." });
      }

      console.log("[generate-questions] Calling Gemini with JD length:", project.jdText.length, "screening minutes:", project.interviewDuration);
      const { competencies, questions, history } = await extractCompetenciesAndQuestions(
        project.jdText,
        project.smeNotesText || undefined,
        undefined, // customInstructions
        project.companyWebsite || undefined,
        project.interviewDuration || undefined,
        undefined, // existing questions
        (project.aiChatHistoryJson || []) as any
      );
      console.log("[generate-questions] Got competencies:", competencies.length, "questions:", questions.length);

      const updated = await storage.updateProject(project.id, {
        competencyRubricJson: competencies,
        screeningQuestionsJson: questions,
        aiChatHistoryJson: history as any,
      });

      console.log("[generate-questions] Updated project successfully");
      res.json(updated);
    } catch (error: any) {
      console.error("[generate-questions] Error:", error?.message || error);
      console.error("[generate-questions] Full error:", error);
      res.status(500).json({ error: "Failed to generate questions", details: error?.message });
    }
  });

  app.post("/api/projects/:id/regenerate-questions", isAuthenticated, async (req, res) => {
    try {
      const project = await storage.getProject(parseInt(req.params.id));
      if (!project) return res.status(404).json({ error: "Project not found" });
      if (!project.jdText) return res.status(400).json({ error: "Job description is required" });

      const { customInstructions } = req.body;

      console.log("[regenerate-questions] Calling Gemini with custom instructions:", customInstructions?.substring(0, 50));
      const existingQuestions = (project.screeningQuestionsJson || []) as ScreeningQuestion[];
      const { competencies, questions, history } = await regenerateQuestionsWithInstructions(
        project.jdText,
        project.smeNotesText || undefined,
        customInstructions || undefined,
        project.companyWebsite || undefined,
        project.interviewDuration || undefined,
        existingQuestions,
        (project.aiChatHistoryJson || []) as any
      );
      console.log("[regenerate-questions] Got competencies:", competencies.length, "questions:", questions.length);

      const updated = await storage.updateProject(project.id, {
        competencyRubricJson: competencies,
        screeningQuestionsJson: questions,
        aiChatHistoryJson: history as any,
      });

      res.json(updated);
    } catch (error: any) {
      console.error("[regenerate-questions] Error:", error?.message || error);
      res.status(500).json({ error: "Failed to regenerate questions", details: error?.message });
    }
  });

  app.post("/api/projects/:id/refine-question", isAuthenticated, async (req, res) => {
    try {
      const project = await storage.getProject(parseInt(req.params.id));
      if (!project) return res.status(404).json({ error: "Project not found" });
      if (!project.jdText) return res.status(400).json({ error: "Job description is required" });

      const { questionId, customInstructions } = req.body;
      if (!questionId) return res.status(400).json({ error: "Question ID is required" });

      const questions = (project.screeningQuestionsJson || []) as ScreeningQuestion[];
      const questionIndex = questions.findIndex(q => q.id === questionId);
      if (questionIndex === -1) return res.status(404).json({ error: "Question not found" });

      console.log(`[refine-question] Refining question ${questionId} for project ${req.params.id}`);
      const { question: refinedQuestion, history } = await refineIndividualQuestion(
        project.jdText,
        questions[questionIndex],
        customInstructions || "Refine this question for better clarity and relevance.",
        (project.aiChatHistoryJson || []) as any
      );

      questions[questionIndex] = refinedQuestion;

      const updated = await storage.updateProject(project.id, {
        screeningQuestionsJson: questions,
        aiChatHistoryJson: history as any,
      });

      res.json(updated);
    } catch (error: any) {
      console.error("[refine-question] Error:", error?.message || error);
      res.status(500).json({ error: "Failed to refine question", details: error?.message });
    }
  });

  app.post("/api/projects/:id/refine-selected-questions", isAuthenticated, async (req, res) => {
    try {
      const project = await storage.getProject(parseInt(req.params.id));
      if (!project) return res.status(404).json({ error: "Project not found" });
      if (!project.jdText) return res.status(400).json({ error: "Job description is required" });

      const { questionIds, customInstructions } = req.body;
      if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
        return res.status(400).json({ error: "Question IDs are required" });
      }

      const allQuestions = (project.screeningQuestionsJson || []) as ScreeningQuestion[];
      const questionsToRefine = allQuestions.filter(q => questionIds.includes(q.id));

      if (questionsToRefine.length === 0) {
        return res.status(404).json({ error: "No matching questions found" });
      }

      console.log(`[refine-selected] Refining ${questionsToRefine.length} questions for project ${req.params.id}`);
      const { questions: refinedBatch, history } = await refineMultipleQuestions(
        project.jdText,
        questionsToRefine,
        customInstructions || "Refine these questions for better clarity and relevance.",
        (project.aiChatHistoryJson || []) as any
      );

      // Merge refined questions back into all questions
      const updatedQuestions = allQuestions.map(q => {
        const refined = refinedBatch.find((r: any) => r.id === q.id);
        return refined || q;
      });

      const updated = await storage.updateProject(project.id, {
        screeningQuestionsJson: updatedQuestions,
        aiChatHistoryJson: history as any,
      });

      res.json(updated);
    } catch (error: any) {
      console.error("[refine-selected] Error:", error?.message || error);
      res.status(500).json({ error: "Failed to refine selected questions", details: error?.message });
    }
  });

  app.post("/api/projects/:id/refine-jd", isAuthenticated, async (req, res) => {
    try {
      const { jdText } = req.body;
      if (!jdText) return res.status(400).json({ error: "Job description is required" });

      console.log(`[refine-jd] Refining JD for project ${req.params.id}`);
      const result = await refineJobDescription(jdText);

      res.json(result);
    } catch (error: any) {
      console.error("[refine-jd] Error:", error?.message || error);
      res.status(500).json({ error: "Failed to refine job description", details: error?.message });
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

  // Create WebSocket server for audio streaming
  // Note: We handle the upgrade manually for /api/interviews/:id/audio
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = request.url || "";
    console.log("[WebSocket] Upgrade request for:", pathname);

    const audioPathMatch = pathname.match(/^\/api\/interviews\/(\d+)\/audio/);
    if (audioPathMatch) {
      const interviewId = parseInt(audioPathMatch[1]);
      console.log("[WebSocket] Handling audio WebSocket for interview:", interviewId);

      wss.handleUpgrade(request, socket, head, (ws) => {
        setupAudioWebSocket(ws, interviewId);
      });
    }
    // If it doesn't match, we do NOTHING. 
    // This allows other upgrade listeners (like Vite's HMR) to handle the request.
  });

  async function setupAudioWebSocket(ws: WebSocket, interviewId: number) {
    console.log(`[WebSocket] Audio WebSocket connected for interview ${interviewId}`);

    let audioBuffer: Buffer[] = [];
    let processingInterval: NodeJS.Timeout | null = null;
    let transcript: TranscriptEntry[] = [];
    let lastSuggestionTime = 0;
    let currentQuestionId: string | null = null;
    let candidateAnswerStartIndex: number | null = null;
    let lastEvaluationTime = 0;

    let interview;
    let project;

    try {
      interview = await storage.getInterview(interviewId);
      if (!interview) {
        console.error(`[WebSocket] Interview ${interviewId} not found`);
        ws.close(1008, "Interview not found");
        return;
      }

      project = await storage.getProject(interview.projectId);
      if (!project) {
        console.error(`[WebSocket] Project ${interview.projectId} not found for interview ${interviewId}`);
        ws.close(1008, "Project not found");
        return;
      }
    } catch (error) {
      console.error(`[WebSocket] Error setting up WebSocket for interview ${interviewId}:`, error);
      ws.close(1011, "Internal server error");
      return;
    }

    if (interview.transcriptJson) {
      transcript = interview.transcriptJson;
    }

    const questions = (project.screeningQuestionsJson || []) as ScreeningQuestion[];

    // Handle text messages for question tracking
    ws.on("message", async (data: Buffer) => {
      // Check if it's a text message (JSON command)
      try {
        const text = data.toString("utf-8");
        if (text.trim().startsWith("{")) {
          const message = JSON.parse(text);
          if (message.type === "mark_question" && message.questionId) {
            currentQuestionId = message.questionId;
            candidateAnswerStartIndex = transcript.length;
            console.log(`[WebSocket] Marked question ${currentQuestionId} at transcript index ${candidateAnswerStartIndex}`);
            ws.send(JSON.stringify({ type: "question_marked", questionId: currentQuestionId }));
            return;
          }
        }
      } catch (e) {
        // Not a JSON message, treat as audio
      }

      // Treat as audio data (binary)
      audioBuffer.push(data);
    });

    const processAudio = async () => {
      if (audioBuffer.length === 0) return;

      const audioData = Buffer.concat(audioBuffer);
      audioBuffer = [];

      try {
        const text = await transcribeAudio(audioData);

        if (text.trim()) {
          // Detect speaker using heuristic
          const speaker = detectSpeaker(text, transcript, true);

          const entry: TranscriptEntry = {
            id: Math.random().toString(36).substring(2, 15),
            speaker,
            text: text.trim(),
            timestamp: Date.now(),
            isFinal: true,
          };

          transcript.push(entry);

          ws.send(JSON.stringify({
            type: "transcript",
            id: entry.id,
            speaker: entry.speaker,
            text: entry.text,
            isFinal: true,
          }));

          await storage.updateInterview(interviewId, {
            transcriptJson: transcript,
          });

          // If interviewer speaks, mark it as a potential question
          if (speaker === "interviewer") {
            // Try to match to a question from the project
            const matchingQuestion = questions.find(q =>
              entry.text.toLowerCase().includes(q.question.toLowerCase().substring(0, 30)) ||
              q.question.toLowerCase().includes(entry.text.toLowerCase().substring(0, 30))
            );

            if (matchingQuestion) {
              currentQuestionId = matchingQuestion.id;
              candidateAnswerStartIndex = transcript.length;
              console.log(`[WebSocket] Detected question ${currentQuestionId} from interviewer speech`);
            }
          }

          // Evaluate answer quality when candidate finishes answering
          // This happens when interviewer speaks next (indicating candidate finished)
          if (speaker === "interviewer" && currentQuestionId && candidateAnswerStartIndex !== null) {
            const question = questions.find(q => q.id === currentQuestionId);
            if (question) {
              // Get candidate's answer (all entries since question was asked, up to this interviewer entry)
              const answerStartIndex = candidateAnswerStartIndex ?? undefined;
              const answerEntries = transcript
                .slice(answerStartIndex, -1)
                .filter(e => e.speaker === "candidate");
              const candidateAnswer = answerEntries.map(e => e.text).join(" ");

              if (candidateAnswer.trim().length > 20) {
                // Only evaluate if answer is substantial
                lastEvaluationTime = Date.now();

                ws.send(JSON.stringify({ type: "evaluating" }));

                // Evaluate asynchronously to not block transcript processing
                evaluateAnswerQuality(question, candidateAnswer, transcript.slice(0, -1))
                  .then((evaluation) => {
                    // Find the last candidate entry to attach evaluation
                    const lastCandidateEntry = transcript
                      .slice(answerStartIndex, -1)
                      .filter(e => e.speaker === "candidate")
                      .pop();

                    if (lastCandidateEntry) {
                      lastCandidateEntry.evaluation = evaluation;

                      // Update transcript in database
                      storage.updateInterview(interviewId, {
                        transcriptJson: transcript,
                      }).then(() => {
                        ws.send(JSON.stringify({
                          type: "answer_evaluation",
                          entryId: lastCandidateEntry.id,
                          questionId: currentQuestionId,
                          quality: evaluation.quality,
                          score: evaluation.score,
                          signals: evaluation.signals,
                          reasoning: evaluation.reasoning,
                        }));

                        console.log(`[WebSocket] Evaluated answer for question ${currentQuestionId}: ${evaluation.quality} (${evaluation.score}/5)`);
                      }).catch(err => console.error("[WebSocket] Error updating transcript:", err));
                    }
                  })
                  .catch((error) => {
                    console.error("[WebSocket] Error evaluating answer:", error);
                  });

                // Reset for next question
                currentQuestionId = null;
                candidateAnswerStartIndex = null;
              }
            }
          }

          // Also evaluate if candidate has been speaking for a while (long answer)
          if (speaker === "candidate" && currentQuestionId && candidateAnswerStartIndex !== null) {
            const answerStartIndex = candidateAnswerStartIndex ?? undefined;
            const answerEntries = transcript
              .slice(answerStartIndex)
              .filter(e => e.speaker === "candidate");
            const candidateAnswer = answerEntries.map(e => e.text).join(" ");

            // If answer is very long (500+ chars), evaluate immediately
            if (candidateAnswer.trim().length > 500 && Date.now() - lastEvaluationTime > 5000) {
              const question = questions.find(q => q.id === currentQuestionId);
              if (question) {
                lastEvaluationTime = Date.now();

                ws.send(JSON.stringify({ type: "evaluating" }));

                evaluateAnswerQuality(question, candidateAnswer, transcript)
                  .then((evaluation) => {
                    if (entry.id) {
                      entry.evaluation = evaluation;

                      storage.updateInterview(interviewId, {
                        transcriptJson: transcript,
                      }).then(() => {
                        ws.send(JSON.stringify({
                          type: "answer_evaluation",
                          entryId: entry.id,
                          questionId: currentQuestionId,
                          quality: evaluation.quality,
                          score: evaluation.score,
                          signals: evaluation.signals,
                          reasoning: evaluation.reasoning,
                        }));
                      }).catch(err => console.error("[WebSocket] Error updating transcript:", err));
                    }
                  })
                  .catch((error) => {
                    console.error("[WebSocket] Error evaluating answer:", error);
                  });
              }
            }
          }

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
