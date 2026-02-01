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
  MessageSquare,
  Brain,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  Target,
  FileText,
  Info
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
    toggleQuestionAsked(questionId);
    
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
          <Skeleton className="h-screen w-full rounded-[2rem]" />
        </div>
      </DesktopOnlyGuard>
    );
  }

  return (
    <DesktopOnlyGuard>
      <div className="min-h-screen bg-background flex flex-col">
        {isRecording && (
          <div className="bg-destructive/10 border-b border-destructive/20 text-destructive py-2 px-4 flex items-center justify-center gap-3 animate-in slide-in-from-top duration-500">
            <div className="relative h-2 w-2">
              <span className="absolute inset-0 rounded-full bg-destructive animate-ping" />
              <span className="relative block h-2 w-2 rounded-full bg-destructive" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Live Interview • Session Recording Active</span>
          </div>
        )}

        <header className="border-b bg-background/80 backdrop-blur-md sticky top-0 z-40">
          <div className="flex items-center justify-between gap-4 px-6 h-16">
            <div className="flex items-center gap-5">
              <Button variant="ghost" size="icon" asChild className="rounded-full h-10 w-10">
                <Link href={`/projects/${project?.id}/interviews`}>
                  <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                </Link>
              </Button>
              <div className="flex flex-col">
                <h1 className="text-sm font-black tracking-tight text-foreground/90">{interview?.candidateName}</h1>
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">{project?.title}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-muted/40 border border-border/40">
                <Clock className="w-4 h-4 text-muted-foreground stroke-[2.5]" />
                <span className="font-mono text-sm font-black tabular-nums tracking-tighter">{formatTime(elapsedTime)}</span>
              </div>
              
              <Badge
                variant="outline"
                className={`gap-2 px-3 py-1 rounded-xl font-bold uppercase tracking-wider text-[10px] border-border/60 ${
                  audioStatus === "connected" ? "bg-green-500/10 text-green-600 border-green-500/20" : ""
                }`}
              >
                {audioStatus === "connected" ? (
                  <>
                    <Mic className="w-3 h-3 stroke-[3]" /> Audio Connected
                  </>
                ) : audioStatus === "connecting" ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin stroke-[3]" /> Connecting...
                  </>
                ) : (
                  <>
                    <MicOff className="w-3 h-3 stroke-[3]" /> Not Connected
                  </>
                )}
              </Badge>
              
              <div className="h-8 w-[1px] bg-border/40 mx-1" />
              
              <ThemeToggle />
              
              {!isRecording ? (
                <Button 
                  onClick={handleConnectAudio} 
                  className="rounded-xl font-black shadow-lg shadow-primary/20 gap-2 px-6 h-10 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  data-testid="button-connect-audio"
                >
                  <Mic className="w-4 h-4 stroke-[3]" />
                  Join Cockpit
                </Button>
              ) : (
                <Button 
                  variant="destructive" 
                  onClick={() => setShowEndDialog(true)} 
                  className="rounded-xl font-black shadow-lg shadow-destructive/20 gap-2 px-6 h-10 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  data-testid="button-end-interview"
                >
                  <Square className="w-4 h-4 fill-current" />
                  Finish Session
                </Button>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden bg-muted/5">
          {/* Left Panel: Identity & Transcript */}
          <div className="w-[380px] border-r flex flex-col bg-background relative z-10">
            <div className="p-6 border-b bg-card/30 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center shrink-0 shadow-inner">
                  <User className="w-7 h-7 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-black text-lg tracking-tight truncate leading-tight mb-1">{interview?.candidateName}</p>
                  <div className="flex items-center gap-2">
                    <Mail className="w-3 h-3 text-muted-foreground/40" />
                    <p className="text-[10px] font-bold text-muted-foreground/60 truncate uppercase tracking-widest">{interview?.candidateEmail || "No email provided"}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="px-6 py-4 flex items-center justify-between bg-muted/20 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground/60" />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Live Intelligence</h3>
                </div>
                {aiStatus !== "idle" && (
                  <Badge variant="outline" className="text-[10px] gap-1.5 py-0 h-5 px-2 rounded-md font-black uppercase tracking-wider bg-background border-primary/20 text-primary">
                    {aiStatus === "listening" ? (
                      <>
                        <span className="relative h-1.5 w-1.5">
                          <span className="absolute inset-0 rounded-full bg-primary animate-ping" />
                          <span className="relative block h-1.5 w-1.5 rounded-full bg-primary" />
                        </span>
                        Listening
                      </>
                    ) : (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Thinking
                      </>
                    )}
                  </Badge>
                )}
              </div>
              
              <ScrollArea className="flex-1 p-6">
                {transcript.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-20 opacity-40">
                    <div className="h-16 w-16 rounded-[1.5rem] bg-muted flex items-center justify-center">
                      <MicOff className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-black uppercase tracking-widest">Waiting for Audio</p>
                      <p className="text-xs font-medium max-w-[180px]">Connect your microphone to begin the live transcription.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6 pb-10">
                    {transcript.map((entry) => {
                      const evaluation = entry.evaluation;
                      const isCandidate = entry.speaker === "candidate";
                      
                      return (entry.text && (
                        <div
                          key={entry.id}
                          className={`relative group animate-in fade-in slide-in-from-bottom-2 duration-500`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge 
                                variant={!isCandidate ? "default" : "secondary"} 
                                className={`text-[9px] font-black uppercase tracking-widest px-2 py-0 h-5 rounded-md ${
                                  !isCandidate ? "bg-primary text-white" : "bg-muted/80 text-muted-foreground"
                                }`}
                              >
                                {!isCandidate ? "You" : "Candidate"}
                              </Badge>
                              <span className="text-[9px] font-bold text-muted-foreground/30 font-mono">
                                {format(new Date(entry.timestamp), "HH:mm:ss")}
                              </span>
                            </div>
                            
                            {evaluation && (
                              <Badge
                                variant="outline"
                                className={`text-[9px] font-black uppercase tracking-widest px-2 py-0 h-5 rounded-md ${
                                  evaluation.quality === "good" ? "border-green-500/30 text-green-600 bg-green-500/5" :
                                  evaluation.quality === "moderate" ? "border-blue-500/30 text-blue-600 bg-blue-500/5" :
                                  "border-red-500/30 text-red-600 bg-red-500/5"
                                }`}
                              >
                                {evaluation.quality} • {evaluation.score}/5
                              </Badge>
                            )}
                          </div>
                          
                          <div className={`p-4 rounded-2xl text-sm leading-relaxed border transition-all ${
                            !isCandidate ? "bg-muted/30 border-border/40 font-medium text-foreground/70" : "bg-card border-border/60 font-semibold text-foreground/90 shadow-sm"
                          } ${!entry.isFinal ? "opacity-50 border-dashed" : ""}`}>
                            {entry.text}
                          </div>

                          {evaluation && (
                            <div className="mt-3 ml-2 space-y-3 border-l-2 border-primary/10 pl-4 py-1">
                              {evaluation.signals.good.length > 0 && (
                                <div className="flex items-start gap-2">
                                  <CheckCircle className="w-3 h-3 text-green-500 mt-0.5 shrink-0" />
                                  <p className="text-[11px] font-bold text-green-700/80 leading-tight">{evaluation.signals.good[0]}</p>
                                </div>
                              )}
                              {evaluation.signals.poor.length > 0 && (
                                <div className="flex items-start gap-2">
                                  <AlertCircle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
                                  <p className="text-[11px] font-bold text-red-700/80 leading-tight">{evaluation.signals.poor[0]}</p>
                                </div>
                              )}
                              <p className="text-[10px] font-medium italic text-muted-foreground leading-snug line-clamp-2">{evaluation.reasoning}</p>
                            </div>
                          )}
                        </div>
                      ));
                    })}
                    <div ref={transcriptEndRef} />
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          {/* Middle Panel: AI Copilot & Questions */}
          <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.02] to-transparent pointer-events-none" />
            
            {suggestions.length > 0 && (
              <div className="p-6 border-b bg-background/40 backdrop-blur-md relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-foreground/80">AI Real-time Copilot</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {suggestions.slice(0, 2).map((suggestion) => (
                    <Card key={suggestion.id} className="rounded-2xl border-primary/20 bg-background shadow-lg shadow-primary/5 group transition-all hover:scale-[1.01]">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <Badge 
                              variant={suggestion.type === "followup" ? "default" : "outline"} 
                              className={`mb-3 rounded-md px-2 py-0 h-5 text-[9px] font-black uppercase tracking-widest ${
                                suggestion.type === "followup" ? "bg-primary" : "border-primary/30 text-primary"
                              }`}
                            >
                              {suggestion.type === "followup" ? "Probe Further" : "New Topic"}
                            </Badge>
                            <p className="text-sm font-bold text-foreground/90 leading-relaxed mb-2 line-clamp-3">{suggestion.question}</p>
                            <div className="flex items-center gap-2">
                              <Info className="w-3 h-3 text-primary/40" />
                              <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest truncate">{suggestion.reason}</p>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 shrink-0">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 rounded-xl bg-green-500/5 text-green-600 hover:bg-green-500/10 border border-green-500/10"
                              onClick={() => handleSuggestionAction(suggestion.id, "asked")}
                              data-testid={`button-suggestion-asked-${suggestion.id}`}
                            >
                              <CheckCircle className="w-4 h-4 stroke-[3]" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 border border-border/40"
                              onClick={() => handleSuggestionAction(suggestion.id, "dismissed")}
                              data-testid={`button-suggestion-dismiss-${suggestion.id}`}
                            >
                              <X className="w-4 h-4 stroke-[3]" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            <ScrollArea className="flex-1 p-8 relative z-10">
              <div className="max-w-3xl mx-auto space-y-10">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Target className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-foreground/80">Guided Rubric</h3>
                  </div>
                  <Badge variant="outline" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-2.5 h-6 border-border/60">
                    {notes.questionsAsked.length} / {questions.length} Asked
                  </Badge>
                </div>

                <Accordion type="multiple" className="space-y-4">
                  {questions.map((question) => {
                    const isAsked = notes.questionsAsked.includes(question.id);
                    return (
                      <AccordionItem
                        key={question.id}
                        value={question.id}
                        className={`border rounded-[1.5rem] px-6 transition-all duration-300 ${
                          isAsked ? "bg-muted/30 border-border/40 opacity-60" : "bg-card border-border/60 shadow-sm hover:shadow-md hover:border-primary/20"
                        }`}
                        data-testid={`cockpit-question-${question.id}`}
                      >
                        <div className="flex items-center gap-5 py-5">
                          <div 
                            className={`flex h-6 w-6 items-center justify-center rounded-lg border-2 transition-all cursor-pointer ${
                              isAsked ? "bg-primary border-primary text-white" : "border-border/60 bg-background hover:border-primary/40"
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              markQuestionAsAsked(question.id);
                            }}
                          >
                            {isAsked && <CheckCircle className="h-4 w-4 stroke-[4]" />}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <p className={`text-base font-bold leading-relaxed transition-all ${isAsked ? "line-through text-muted-foreground/60" : "text-foreground/90"}`}>
                              {question.question}
                            </p>
                            <div className="flex items-center gap-3 mt-2">
                              <Badge variant="outline" className="rounded-md bg-muted/50 border-border/40 text-[9px] font-black uppercase tracking-wider text-muted-foreground/60 h-5">
                                {getCompetencyName(question.competencyId)}
                              </Badge>
                              {question.isMandatory && (
                                <Badge className="rounded-md bg-primary/5 text-primary border-primary/10 text-[9px] font-black uppercase tracking-wider h-5">
                                  Required
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          <AccordionTrigger className="py-0 hover:no-underline" />
                        </div>
                        
                        <AccordionContent className="pt-0 pb-6 ml-11">
                          <div className="space-y-6 pt-4 border-t border-border/40">
                            <div className="space-y-2">
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2">
                                <Brain className="w-3 h-3" /> Target Reasoning
                              </h4>
                              <p className="text-sm font-medium text-foreground/70 leading-relaxed bg-muted/20 p-4 rounded-2xl border border-border/20">
                                {question.rubric.typicalReasoning}
                              </p>
                            </div>
                            
                            <div className="grid sm:grid-cols-3 gap-4">
                              <div className="p-4 rounded-[1.25rem] bg-green-500/[0.03] border border-green-500/10">
                                <h4 className="text-[10px] font-black flex items-center gap-2 mb-3 text-green-600 uppercase tracking-widest">
                                  <CheckCircle className="w-3.5 h-3.5" /> High Signal
                                </h4>
                                <ul className="space-y-2">
                                  {question.rubric.goodSignals?.map((s, i) => (
                                    <li key={i} className="text-[11px] font-semibold text-muted-foreground flex gap-2">
                                      <span className="h-1 w-1 rounded-full bg-green-500/40 mt-1.5 shrink-0" />
                                      {s}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div className="p-4 rounded-[1.25rem] bg-blue-500/[0.03] border border-blue-500/10">
                                <h4 className="text-[10px] font-black flex items-center gap-2 mb-3 text-blue-600 uppercase tracking-widest">
                                  <MessageSquare className="w-3.5 h-3.5" /> Neutral
                                </h4>
                                <ul className="space-y-2">
                                  {question.rubric.moderateSignals?.map((s, i) => (
                                    <li key={i} className="text-[11px] font-semibold text-muted-foreground flex gap-2">
                                      <span className="h-1 w-1 rounded-full bg-blue-500/40 mt-1.5 shrink-0" />
                                      {s}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div className="p-4 rounded-[1.25rem] bg-amber-500/[0.03] border border-amber-500/10">
                                <h4 className="text-[10px] font-black flex items-center gap-2 mb-3 text-amber-600 uppercase tracking-widest">
                                  <AlertCircle className="w-3.5 h-3.5" /> Low Signal
                                </h4>
                                <ul className="space-y-2">
                                  {question.rubric.poorSignals?.map((s, i) => (
                                    <li key={i} className="text-[11px] font-semibold text-muted-foreground flex gap-2">
                                      <span className="h-1 w-1 rounded-full bg-amber-500/40 mt-1.5 shrink-0" />
                                      {s}
                                    </li>
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
              </div>
            </ScrollArea>
          </div>

          {/* Right Panel: Notes & Ratings */}
          <div className="w-[400px] border-l flex flex-col bg-background relative z-10">
            <div className="p-6 border-b flex items-center gap-3 bg-muted/10">
              <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Settings className="w-4 h-4 text-primary" />
              </div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-foreground/80">Session Controls</h3>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-8 space-y-10">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1 text-primary">
                    <FileText className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Interviewer Notes</span>
                  </div>
                  <Textarea
                    value={notes.freeformNotes}
                    onChange={(e) => setNotes((prev) => ({ ...prev, freeformNotes: e.target.value }))}
                    placeholder="Capture observations, specific quotes, or follow-up thoughts..."
                    className="min-h-[280px] rounded-[1.5rem] border-border/60 bg-muted/30 focus-visible:ring-primary/20 focus-visible:border-primary transition-all p-6 text-sm font-medium resize-none leading-relaxed shadow-inner"
                    data-testid="textarea-notes"
                  />
                </div>

                <div className="space-y-8">
                  <div className="flex items-center gap-2 px-1 text-primary">
                    <ShieldCheck className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Live Scoring Matrix</span>
                  </div>
                  
                  <div className="grid gap-10">
                    {competencies.map((comp) => {
                      const rating = notes.competencyRatings[comp.id] || 0;
                      return (
                        <div key={comp.id} className="space-y-5">
                          <div className="flex items-end justify-between px-1">
                            <div className="min-w-0">
                              <h4 className="text-sm font-black text-foreground/90 tracking-tight leading-none mb-1 truncate">{comp.name}</h4>
                              <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest truncate">Competency Rating</p>
                            </div>
                            <div className="flex items-baseline gap-1 bg-primary/5 px-2 py-1 rounded-lg border border-primary/10">
                              <span className="text-xl font-black text-primary tracking-tighter">{rating || "-"}</span>
                              <span className="text-[9px] font-black text-muted-foreground/30 uppercase">/ 5</span>
                            </div>
                          </div>
                          
                          <div className="px-2">
                            <Slider
                              value={[rating]}
                              onValueChange={([val]) => setCompetencyRating(comp.id, val)}
                              max={5}
                              min={0}
                              step={1}
                              className="py-2"
                              data-testid={`slider-rating-${comp.id}`}
                            />
                            <div className="flex justify-between mt-2">
                              <span className="text-[9px] font-black text-muted-foreground/30 uppercase tracking-tighter">Needs Review</span>
                              <span className="text-[9px] font-black text-primary uppercase tracking-tighter">Exemplary</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </ScrollArea>
            
            <div className="p-6 bg-card border-t border-border/40">
              <Button 
                variant="destructive" 
                onClick={() => setShowEndDialog(true)} 
                className="w-full rounded-2xl h-14 font-black text-base shadow-xl shadow-destructive/20 gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Square className="w-5 h-5 fill-current" />
                Finish & Generate Report
              </Button>
            </div>
          </div>
        </div>

        <AlertDialog open={showConsentDialog} onOpenChange={setShowConsentDialog}>
          <AlertDialogContent className="rounded-[2rem] border-border/40 shadow-2xl">
            <AlertDialogHeader className="space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-primary" />
              </div>
              <AlertDialogTitle className="text-2xl font-black tracking-tight">Privacy & Consent</AlertDialogTitle>
              <AlertDialogDescription className="text-base font-medium leading-relaxed">
                By starting this session, you confirm that all participants have been informed and have 
                consented to the real-time processing of audio for transcription purposes.
                <br /><br />
                <span className="text-primary font-bold">Candiq-AI does not store raw audio files.</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="pt-6">
              <AlertDialogCancel className="rounded-xl font-bold h-12">Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleConsentConfirm} 
                className="rounded-xl font-black h-12 px-8 shadow-lg shadow-primary/20"
                data-testid="button-confirm-consent"
              >
                Confirm Consent
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showEndDialog} onOpenChange={setShowEndDialog}>
          <AlertDialogContent className="rounded-[2rem] border-border/40 shadow-2xl">
            <AlertDialogHeader className="space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
                <Square className="w-6 h-6 text-destructive fill-current" />
              </div>
              <AlertDialogTitle className="text-2xl font-black tracking-tight">End Interview?</AlertDialogTitle>
              <AlertDialogDescription className="text-base font-medium leading-relaxed">
                This will finalize the session, stop all recording, and immediately trigger the AI 
                to generate a comprehensive evaluation report. This action is permanent.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="pt-6">
              <AlertDialogCancel className="rounded-xl font-bold h-12">Continue Session</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleEndInterview} 
                className="rounded-xl font-black h-12 px-8 bg-destructive hover:bg-destructive shadow-lg shadow-destructive/20"
                data-testid="button-confirm-end"
              >
                {endInterview.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : "End & Generate Report"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DesktopOnlyGuard>
  );
}
