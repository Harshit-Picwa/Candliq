import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DesktopOnlyGuard } from "@/components/desktop-only-guard";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, Interview, ScreeningQuestion, Competency, TranscriptEntry, InterviewNotes, AISuggestion } from "@shared/schema";
import {
  ArrowLeft,
  Mic,
  MicOff,
  Square,
  Radio,
  Loader2,
  Lightbulb,
  CheckCircle,
  X,
  AlertCircle,
  User,
  Briefcase,
  Clock,
} from "lucide-react";
import { format } from "date-fns";

type AudioStatus = "idle" | "connecting" | "connected" | "error" | "no_audio";
type AIStatus = "idle" | "listening" | "thinking";

export default function InterviewCockpitPage() {
  const { id: interviewId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [audioStatus, setAudioStatus] = useState<AudioStatus>("idle");
  const [aiStatus, setAiStatus] = useState<AIStatus>("idle");
  const [consentGiven, setConsentGiven] = useState(false);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [notes, setNotes] = useState<InterviewNotes>({
    freeformNotes: "",
    competencyRatings: {},
    questionsAsked: [],
    questionsDismissed: [],
  });
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const { data: interview, isLoading: interviewLoading } = useQuery<Interview>({
    queryKey: ["/api/interviews", interviewId],
  });

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", interview?.projectId],
    enabled: !!interview?.projectId,
  });

  const competencies = project?.competencyRubricJson || [];
  const questions = project?.screeningQuestionsJson || [];

  useEffect(() => {
    if (interview) {
      setConsentGiven(interview.consentGiven || false);
      setTranscript(interview.transcriptJson || []);
      if (interview.notesJson) {
        setNotes(interview.notesJson);
      }
    }
  }, [interview]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const notesRef = useRef(notes);
  notesRef.current = notes;

  useEffect(() => {
    if (!isRecording) return;
    
    const saveInterval = setInterval(() => {
      updateInterview.mutate({ notesJson: notesRef.current });
    }, 10000);

    return () => clearInterval(saveInterval);
  }, [isRecording, interviewId]);

  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const updateInterview = useMutation({
    mutationFn: async (data: Partial<Interview>) => {
      return apiRequest("PATCH", `/api/interviews/${interviewId}`, data);
    },
  });

  const endInterview = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/interviews/${interviewId}/end`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interviews", interviewId] });
      toast({ title: "Interview ended", description: "Generating report..." });
      navigate(`/interviews/${interviewId}/report`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to end interview.", variant: "destructive" });
    },
  });

  const handleConnectAudio = async () => {
    if (!consentGiven) {
      setShowConsentDialog(true);
      return;
    }

    try {
      setAudioStatus("connecting");

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();

      const displayAudioTracks = displayStream.getAudioTracks();
      if (displayAudioTracks.length > 0) {
        const displaySource = audioContext.createMediaStreamSource(
          new MediaStream(displayAudioTracks)
        );
        displaySource.connect(destination);
      }

      const micSource = audioContext.createMediaStreamSource(micStream);
      micSource.connect(destination);

      displayStream.getVideoTracks().forEach((track) => track.stop());

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/interviews/${interviewId}/audio`);
      wsRef.current = ws;

      ws.onopen = () => {
        setAudioStatus("connected");
        setIsRecording(true);
        startTimer();
        updateInterview.mutate({ status: "in_progress", consentGiven: true });
        setAiStatus("listening");

        const mediaRecorder = new MediaRecorder(destination.stream, {
          mimeType: "audio/webm;codecs=opus",
        });

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            event.data.arrayBuffer().then((buffer) => {
              ws.send(buffer);
            });
          }
        };

        mediaRecorder.start(1000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "transcript") {
            const entry: TranscriptEntry = {
              id: data.id || crypto.randomUUID(),
              speaker: data.speaker || "candidate",
              text: data.text,
              timestamp: Date.now(),
              isFinal: data.isFinal,
            };
            setTranscript((prev) => {
              // Update existing entry if ID matches, otherwise add new
              const existingIndex = prev.findIndex(e => e.id === entry.id);
              if (existingIndex >= 0) {
                const updated = [...prev];
                updated[existingIndex] = { ...updated[existingIndex], ...entry };
                return updated;
              }
              
              if (!data.isFinal && prev.length > 0) {
                const last = prev[prev.length - 1];
                if (!last.isFinal && last.speaker === entry.speaker) {
                  return [...prev.slice(0, -1), entry];
                }
              }
              return [...prev, entry];
            });
            setAiStatus("listening");
          } else if (data.type === "answer_evaluation") {
            setTranscript((prev) => {
              return prev.map((entry) => {
                if (entry.id === data.entryId) {
                  return {
                    ...entry,
                    evaluation: {
                      quality: data.quality,
                      score: data.score,
                      signals: data.signals,
                      reasoning: data.reasoning,
                      questionId: data.questionId,
                    },
                  };
                }
                return entry;
              });
            });
            setAiStatus("idle");
            toast({
              title: "Answer Evaluated",
              description: `Quality: ${data.quality} (${data.score}/5)`,
            });
          } else if (data.type === "evaluating") {
            setAiStatus("thinking");
          } else if (data.type === "question_marked") {
            toast({
              title: "Question Marked",
              description: "Answer evaluation will begin after candidate responds",
            });
          } else if (data.type === "suggestion") {
            setSuggestions(data.suggestions || []);
            setAiStatus("idle");
          } else if (data.type === "thinking") {
            setAiStatus("thinking");
          }
        } catch (e) {
          console.error("WebSocket message parse error:", e);
        }
      };

      ws.onerror = () => {
        setAudioStatus("error");
        toast({ title: "Connection error", description: "Failed to connect audio.", variant: "destructive" });
      };

      ws.onclose = () => {
        if (isRecording) {
          setAudioStatus("idle");
          stopTimer();
          setIsRecording(false);
        }
      };
    } catch (error: any) {
      console.error("Audio capture error:", error);
      if (error.name === "NotAllowedError") {
        toast({ title: "Permission denied", description: "Please allow screen and microphone access.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: "Failed to capture audio.", variant: "destructive" });
      }
      setAudioStatus("error");
    }
  };

  const handleDisconnectAudio = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    stopTimer();
    setIsRecording(false);
    setAudioStatus("idle");
    setAiStatus("idle");
    updateInterview.mutate({ transcriptJson: transcript, notesJson: notes });
  };

  const handleConsentConfirm = () => {
    setConsentGiven(true);
    setShowConsentDialog(false);
    handleConnectAudio();
  };

  const handleEndInterview = async () => {
    await updateInterview.mutateAsync({ 
      transcriptJson: transcript, 
      notesJson: notes 
    });
    handleDisconnectAudio();
    endInterview.mutate();
  };

  const toggleQuestionAsked = (questionId: string) => {
    setNotes((prev) => {
      const isAsked = prev.questionsAsked.includes(questionId);
      return {
        ...prev,
        questionsAsked: isAsked
          ? prev.questionsAsked.filter((id) => id !== questionId)
          : [...prev.questionsAsked, questionId],
      };
    });
  };

  const markQuestionAsAsked = (questionId: string) => {
    // Mark in notes
    toggleQuestionAsked(questionId);
    
    // Send to WebSocket for answer tracking
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "mark_question",
        questionId,
      }));
    }
  };

  const handleSuggestionAction = (suggestionId: string, action: "asked" | "dismissed") => {
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
    if (action === "asked") {
      toast({ title: "Marked as asked" });
    }
  };

  const setCompetencyRating = (competencyId: string, rating: number) => {
    setNotes((prev) => ({
      ...prev,
      competencyRatings: {
        ...prev.competencyRatings,
        [competencyId]: rating,
      },
    }));
  };

  const getCompetencyName = (competencyId: string) => {
    return competencies.find((c) => c.id === competencyId)?.name || "Unknown";
  };

  const isLoading = interviewLoading || projectLoading;

  if (isLoading) {
    return (
      <DesktopOnlyGuard>
        <div className="min-h-screen bg-background p-6">
          <Skeleton className="h-screen w-full" />
        </div>
      </DesktopOnlyGuard>
    );
  }

  return (
    <DesktopOnlyGuard>
      <div className="min-h-screen bg-background flex flex-col">
        {isRecording && (
          <div className="sticky top-0 z-50 bg-destructive text-destructive-foreground py-2 px-4 flex items-center justify-center gap-2">
            <Radio className="w-4 h-4 animate-pulse" />
            <span className="text-sm font-medium">Recording in progress - Audio is being captured</span>
          </div>
        )}

        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center justify-between gap-4 px-6 h-14">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" asChild>
                <Link href={`/projects/${project?.id}/interviews`}>
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </Button>
              <div>
                <h1 className="text-sm font-medium">{interview?.candidateName}</h1>
                <p className="text-xs text-muted-foreground">{project?.title}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-card">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="font-mono text-sm tabular-nums">{formatTime(elapsedTime)}</span>
              </div>
              <Badge
                variant={
                  audioStatus === "connected"
                    ? "default"
                    : audioStatus === "error"
                    ? "destructive"
                    : "secondary"
                }
                className="gap-1"
              >
                {audioStatus === "connected" ? (
                  <>
                    <Mic className="w-3 h-3" /> Connected
                  </>
                ) : audioStatus === "connecting" ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" /> Connecting
                  </>
                ) : audioStatus === "error" ? (
                  <>
                    <MicOff className="w-3 h-3" /> Error
                  </>
                ) : (
                  <>
                    <MicOff className="w-3 h-3" /> Not Connected
                  </>
                )}
              </Badge>
              <ThemeToggle />
              {!isRecording ? (
                <Button onClick={handleConnectAudio} data-testid="button-connect-audio">
                  <Mic className="w-4 h-4 mr-2" />
                  Connect Audio
                </Button>
              ) : (
                <Button variant="destructive" onClick={() => setShowEndDialog(true)} data-testid="button-end-interview">
                  <Square className="w-4 h-4 mr-2" />
                  End Interview
                </Button>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-80 border-r flex flex-col bg-card/50">
            <div className="p-4 border-b">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{interview?.candidateName}</p>
                      <p className="text-xs text-muted-foreground">{interview?.candidateEmail || "No email"}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{project?.title}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex-1 p-4 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium">Live Transcript</h3>
                {aiStatus !== "idle" && (
                  <Badge variant="outline" className="text-xs gap-1">
                    {aiStatus === "listening" ? (
                      <>
                        <Radio className="w-3 h-3" /> Listening...
                      </>
                    ) : (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
                      </>
                    )}
                  </Badge>
                )}
              </div>
              <ScrollArea className="flex-1 rounded-md border bg-background p-3">
                {transcript.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Transcript will appear here once audio is connected
                  </p>
                ) : (
                  <div className="space-y-3">
                    {transcript.map((entry) => {
                      const evaluation = entry.evaluation;
                      const qualityColor = evaluation
                        ? evaluation.quality === "strong"
                          ? "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400"
                          : evaluation.quality === "moderate"
                          ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-700 dark:text-yellow-400"
                          : "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400"
                        : "";
                      
                      return (
                        <div
                          key={entry.id}
                          className={`text-sm rounded-lg p-3 border transition-colors ${
                            !entry.isFinal ? "opacity-60" : ""
                          } ${evaluation ? qualityColor : "bg-background"}`}
                        >
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge variant={entry.speaker === "interviewer" ? "default" : "secondary"} className="text-xs">
                              {entry.speaker === "interviewer" ? "You" : "Candidate"}
                            </Badge>
                            {evaluation && (
                              <>
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${
                                    evaluation.quality === "strong"
                                      ? "border-green-500 text-green-700 dark:text-green-400"
                                      : evaluation.quality === "moderate"
                                      ? "border-yellow-500 text-yellow-700 dark:text-yellow-400"
                                      : "border-red-500 text-red-700 dark:text-red-400"
                                  }`}
                                >
                                  {evaluation.quality.toUpperCase()} ({evaluation.score}/5)
                                </Badge>
                              </>
                            )}
                            <span className="text-xs text-muted-foreground font-mono">
                              {format(new Date(entry.timestamp), "HH:mm:ss")}
                            </span>
                          </div>
                          <p className="text-muted-foreground mb-2">{entry.text}</p>
                          {evaluation && (
                            <div className="mt-2 pt-2 border-t border-current/20">
                              <div className="text-xs space-y-1">
                                {evaluation.signals.strong.length > 0 && (
                                  <div>
                                    <span className="font-medium text-green-700 dark:text-green-400">✓ Strong signals:</span>
                                    <ul className="list-disc list-inside ml-2 text-muted-foreground">
                                      {evaluation.signals.strong.map((signal, idx) => (
                                        <li key={idx}>{signal}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {evaluation.signals.weak.length > 0 && (
                                  <div>
                                    <span className="font-medium text-red-700 dark:text-red-400">⚠ Weak signals:</span>
                                    <ul className="list-disc list-inside ml-2 text-muted-foreground">
                                      {evaluation.signals.weak.map((signal, idx) => (
                                        <li key={idx}>{signal}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {evaluation.reasoning && (
                                  <p className="text-muted-foreground italic mt-1">{evaluation.reasoning}</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div ref={transcriptEndRef} />
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {suggestions.length > 0 && (
              <div className="p-4 border-b bg-primary/5">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-medium">AI Suggestions</h3>
                </div>
                <div className="grid gap-3">
                  {suggestions.slice(0, 2).map((suggestion) => (
                    <Card key={suggestion.id} className="border-primary/20">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <Badge variant={suggestion.type === "followup" ? "default" : "outline"} className="mb-2">
                              {suggestion.type === "followup" ? "Follow-up" : "New Topic"}
                            </Badge>
                            <p className="text-sm font-medium">{suggestion.question}</p>
                            <p className="text-xs text-muted-foreground mt-1">{suggestion.reason}</p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSuggestionAction(suggestion.id, "asked")}
                              data-testid={`button-suggestion-asked-${suggestion.id}`}
                            >
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSuggestionAction(suggestion.id, "dismissed")}
                              data-testid={`button-suggestion-dismiss-${suggestion.id}`}
                            >
                              <X className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            <ScrollArea className="flex-1 p-4">
              <h3 className="text-sm font-medium mb-4">Screening Questions</h3>
              <Accordion type="multiple" className="space-y-2">
                {questions.map((question) => {
                  const isAsked = notes.questionsAsked.includes(question.id);
                  return (
                    <AccordionItem
                      key={question.id}
                      value={question.id}
                      className={`border rounded-lg px-4 ${isAsked ? "bg-primary/5 border-primary/20" : ""}`}
                      data-testid={`cockpit-question-${question.id}`}
                    >
                      <div className="flex items-center gap-3 py-3">
                        <Checkbox
                          checked={isAsked}
                          onCheckedChange={() => markQuestionAsAsked(question.id)}
                          data-testid={`checkbox-asked-${question.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${isAsked ? "line-through text-muted-foreground" : ""}`}>
                            {question.question}
                          </p>
                        </div>
                        <Badge variant={question.isMandatory ? "default" : "outline"} className="shrink-0 text-xs">
                          {question.isMandatory ? "Must Ask" : "Optional"}
                        </Badge>
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {getCompetencyName(question.competencyId)}
                        </Badge>
                        <AccordionTrigger className="py-0 hover:no-underline" />
                      </div>
                      <AccordionContent className="pt-0 pb-4">
                        <div className="pl-8 space-y-3">
                          <div>
                            <h4 className="text-xs font-medium text-muted-foreground mb-1">What to look for:</h4>
                            <p className="text-sm">{question.rubric.typicalReasoning}</p>
                          </div>
                          <div className="grid sm:grid-cols-2 gap-3">
                            <div className="p-3 rounded-md bg-green-500/10">
                              <h4 className="text-xs font-medium flex items-center gap-1 mb-2">
                                <CheckCircle className="w-3 h-3 text-green-500" /> Strong
                              </h4>
                              <ul className="text-xs space-y-1">
                                {question.rubric.strongSignals.map((s, i) => (
                                  <li key={i}>• {s}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="p-3 rounded-md bg-amber-500/10">
                              <h4 className="text-xs font-medium flex items-center gap-1 mb-2">
                                <AlertCircle className="w-3 h-3 text-amber-500" /> Weak
                              </h4>
                              <ul className="text-xs space-y-1">
                                {question.rubric.weakSignals.map((s, i) => (
                                  <li key={i}>• {s}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </ScrollArea>
          </div>

          <div className="w-96 border-l flex flex-col bg-card/50">
            <div className="p-4 border-b">
              <h3 className="text-sm font-medium mb-3">Interview Notes</h3>
              <Textarea
                value={notes.freeformNotes}
                onChange={(e) => setNotes((prev) => ({ ...prev, freeformNotes: e.target.value }))}
                placeholder="Take notes during the interview..."
                className="min-h-[200px] resize-none"
                data-testid="textarea-notes"
              />
            </div>

            <ScrollArea className="flex-1 p-4">
              <h3 className="text-sm font-medium mb-4">Competency Ratings</h3>
              <div className="space-y-6">
                {competencies.map((comp) => {
                  const rating = notes.competencyRatings[comp.id] || 0;
                  return (
                    <div key={comp.id}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{comp.name}</span>
                        <Badge variant={rating > 0 ? "default" : "outline"}>{rating || "-"}/5</Badge>
                      </div>
                      <Slider
                        value={[rating]}
                        onValueChange={([val]) => setCompetencyRating(comp.id, val)}
                        max={5}
                        min={0}
                        step={1}
                        className="py-2"
                        data-testid={`slider-rating-${comp.id}`}
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>Not rated</span>
                        <span>Excellent</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        <AlertDialog open={showConsentDialog} onOpenChange={setShowConsentDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Audio Recording Consent</AlertDialogTitle>
              <AlertDialogDescription>
                By clicking "I Confirm", you acknowledge that all participants in this interview have 
                consented to audio recording and transcription. The audio will be processed for 
                real-time transcription only - raw audio is not stored.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConsentConfirm} data-testid="button-confirm-consent">
                I Confirm - All Participants Consent
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showEndDialog} onOpenChange={setShowEndDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>End Interview?</AlertDialogTitle>
              <AlertDialogDescription>
                This will stop the recording and generate a structured evaluation report 
                based on the interview. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Continue Interview</AlertDialogCancel>
              <AlertDialogAction onClick={handleEndInterview} data-testid="button-confirm-end">
                {endInterview.isPending ? "Generating Report..." : "End & Generate Report"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DesktopOnlyGuard>
  );
}
