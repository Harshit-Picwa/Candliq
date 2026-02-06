import { useState, useEffect, useRef, useMemo } from "react";
import { format } from "date-fns";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Header } from "@/components/header";
import { DesktopOnlyGuard } from "@/components/desktop-only-guard";
import { StageProgressBar } from "@/components/stage-progress-bar";
import { ProjectLayout } from "@/components/project-layout";
import { RefiningQuestionsProgress } from "@/components/refining-questions-progress";
import { GeneratingQuestionsProgress } from "@/components/generating-questions-progress";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { Project, ScreeningQuestion, Competency } from "@shared/schema";
import { ArrowLeft, Trash2, CheckCircle, AlertCircle, Loader2, MessageSquare, Edit, ShieldCheck, ArrowUp, ArrowDown, Sparkles, ChevronRight, ChevronLeft, Settings, Brain, X, MapPin, Calendar, Clock, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function AutoResizeTextarea({
  value,
  onChange,
  className,
  placeholder,
  ...props
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
  placeholder?: string;
  [key: string]: any;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "0px";
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = scrollHeight + "px";
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => {
        onChange(e);
        adjustHeight();
      }}
      placeholder={placeholder}
      className={`w-full overflow-hidden resize-none bg-transparent outline-none focus:ring-0 ${className}`}
      {...props}
    />
  );
}

export default function QuestionsSetupPage() {
  const { id } = useParams<{ id: string }>();
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  
  // Check if we're in preview/review mode - re-check when URL changes
  const isPreviewMode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("preview") === "true";
  }, [location]);

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["/api/projects", id],
  });

  const [questions, setQuestions] = useState<ScreeningQuestion[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [showRefineDialog, setShowRefineDialog] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");
  const [editedQuestionIds, setEditedQuestionIds] = useState<Set<string>>(new Set());
  const [approved, setApproved] = useState(false);
  const [editModeAfterApproval, setEditModeAfterApproval] = useState(false);
  const [step, setStep] = useState<"edit" | "review" | "launch">("edit");
  const isLocked = approved && !editModeAfterApproval;
  const invalidQuestionIds = useMemo(() => {
    const invalidIds = questions
      .filter((q) => !((q?.question ?? "").trim()))
      .map((q) => q?.id)
      .filter((id): id is string => Boolean(id));
    return new Set(invalidIds);
  }, [questions]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [isRefiningIndividual, setIsRefiningIndividual] = useState(false);
  const [selectedForRefine, setSelectedForRefine] = useState<Set<string>>(new Set());
  const [isRefiningSelected, setIsRefiningSelected] = useState(false);
  const [showReviewConfirmModal, setShowReviewConfirmModal] = useState(false);
  const [deleteQuestionConfirm, setDeleteQuestionConfirm] = useState<{ id: string; preview: string } | null>(null);
  const [timeAnalysis, setTimeAnalysis] = useState<{
    totalEstimatedMinutes: number;
    breakdown: Array<{
      questionId: string;
      questionText: string;
      estimatedMinutes: number;
      complexity: "simple" | "moderate" | "complex";
      reasoning: string;
    }>;
    summary: string;
    recommendation: string;
    withinBudget: boolean;
  } | null>(null);

  const initialStepSet = useRef(false);
  const stageSaved = useRef(false);
  
  // Time estimates per complexity level (must match server TIME_ESTIMATES)
  const TIME_ESTIMATES = { simple: 2.0, moderate: 2.5, complex: 3.0 };
  
  // Real-time calculation based on pre-assigned complexity from AI
  const calculateRealTimeEstimate = () => {
    const included = questions.filter(q => q.isMandatory);
    if (included.length === 0) return { total: 0, counts: { simple: 0, moderate: 0, complex: 0 } };
    
    const counts = { simple: 0, moderate: 0, complex: 0 };
    let total = 0;
    
    for (const q of included) {
      // Use AI-assigned complexity if available, otherwise default to moderate
      const complexity = (q as any).complexity || "moderate";
      const validComplexity = ["simple", "moderate", "complex"].includes(complexity) ? complexity : "moderate";
      counts[validComplexity as keyof typeof counts]++;
      total += TIME_ESTIMATES[validComplexity as keyof typeof TIME_ESTIMATES];
    }
    
    const result = { total: Math.round(total * 10) / 10, counts };
    console.log(`[TimeEstimate] ${included.length} included questions: ${counts.simple}S + ${counts.moderate}M + ${counts.complex}C = ${result.total} min`);
    return result;
  };
  
  const realTimeEstimate = calculateRealTimeEstimate();
  const includedQuestionsCount = questions.filter(q => q.isMandatory).length;
  // Use real-time calculation (updates instantly when toggling), AI analysis overrides in modal
  const estimatedMinutes = realTimeEstimate.total;
  const configuredScreeningTime = (project as any)?.interviewDuration || 0;
  
  // Mutation to fetch AI time analysis
  const analyzeTime = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${id}/analyze-time`);
      return await res.json();
    },
    onSuccess: (data) => {
      setTimeAnalysis(data as any);
    },
    onError: (error) => {
      console.error("[analyzeTime] Error:", error);
      // Fallback to real-time calculation based on pre-assigned complexity
      const estimate = calculateRealTimeEstimate();
      setTimeAnalysis({
        totalEstimatedMinutes: estimate.total,
        breakdown: questions.filter(q => q.isMandatory).map(q => ({
          questionId: q.id,
          questionText: q.question.substring(0, 60) + "...",
          estimatedMinutes: TIME_ESTIMATES[((q as any).complexity || "moderate") as keyof typeof TIME_ESTIMATES] || 2.5,
          complexity: (q as any).complexity || "moderate",
          reasoning: "Based on AI-assigned complexity",
        })),
        summary: `The screening consists of ${estimate.counts.simple} simple, ${estimate.counts.moderate} moderate, and ${estimate.counts.complex} complex questions, totaling ${estimate.total} minutes of pure Q&A time.`,
        recommendation: "Using pre-assigned complexity from question generation.",
        withinBudget: estimate.total <= configuredScreeningTime,
      });
    },
  });
  
  useEffect(() => {
    if (project) {
      const loadedQuestions = project.screeningQuestionsJson || [];
      const loadedCompetencies = project.competencyRubricJson || [];
      setQuestions(loadedQuestions);
      setCompetencies(loadedCompetencies);
      // Select first question by default so rubric shows immediately
      const firstQuestion = loadedQuestions[0];
      setSelectedQuestionId(firstQuestion?.id || null);
      setEditedQuestionIds(new Set());
      setApproved(project.status === "questions_approved");
      
      // On initial load, restore the saved step or default based on status
      if (!initialStepSet.current) {
        console.log("[useEffect] Loading project - status:", project.status, "questionsStep:", project.questionsStep);
        if (project.questionsStep === "edit" || project.questionsStep === "review") {
          console.log("[useEffect] Setting step from saved:", project.questionsStep);
          setStep(project.questionsStep);
        } else if (project.status === "questions_approved") {
          console.log("[useEffect] Setting step to review (approved project)");
          setStep("review");
        }
        initialStepSet.current = true;
      }
    }
  }, [project]);

  // Persist current stage when visiting this page (even if user doesn't change subtabs)
  useEffect(() => {
    if (project && !stageSaved.current) {
      apiRequest("PATCH", `/api/projects/${id}`, { currentStage: 2 });
      stageSaved.current = true;
    }
  }, [project, id]);
  
  // Save step to server when it changes
  const saveStep = useMutation({
    mutationFn: async (newStep: "edit" | "review") => {
      return apiRequest("PATCH", `/api/projects/${id}`, {
        questionsStep: newStep,
        currentStage: 2,
      });
    },
  });

  const saveQuestions = useMutation({
    mutationFn: async (statusOverride?: string) => {
      return apiRequest("PATCH", `/api/projects/${id}`, {
        screeningQuestionsJson: questions,
        competencyRubricJson: competencies,
        status: statusOverride ?? "draft",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      setHasChanges(false);
      toast({ title: "Saved", description: "Questions saved successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save questions.", variant: "destructive" });
    },
  });

  const regenerateQuestions = useMutation({
    mutationFn: async () => {
      // Use regenerate endpoint so we don't repeat previous questions.
      return apiRequest("POST", `/api/projects/${id}/regenerate-questions`, {
        customInstructions: "",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      toast({ title: "Questions regenerated", description: "New questions have been generated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to regenerate questions.", variant: "destructive" });
    },
  });

  const refineQuestions = useMutation({
    mutationFn: async ({ instructions, questionId, questionIds }: { instructions: string, questionId?: string, questionIds?: string[] }) => {
      if (questionId) {
        return apiRequest("POST", `/api/projects/${id}/refine-question`, {
          questionId,
          customInstructions: instructions,
        });
      }
      if (questionIds && questionIds.length > 0) {
        return apiRequest("POST", `/api/projects/${id}/refine-selected-questions`, {
          questionIds,
          customInstructions: instructions,
        });
      }
      return apiRequest("POST", `/api/projects/${id}/regenerate-questions`, {
        customInstructions: instructions,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      setShowRefineDialog(false);
      setCustomInstructions("");
      setIsRefiningIndividual(false);
      setIsRefiningSelected(false);
      setSelectedForRefine(new Set());

      let title = "Questions refined";
      if (variables.questionId) title = "Question refined";
      else if (variables.questionIds) title = `${variables.questionIds.length} Questions refined`;

      toast({
        title,
        description: variables.questionId
          ? "The question has been refined based on your instructions."
          : "The questions have been updated with your custom instructions."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to refine questions. Try again or regenerate all.",
        variant: "destructive",
        action: (
          <Button variant="outline" size="sm" onClick={() => regenerateQuestions.mutate()}>
            Regenerate All
          </Button>
        )
      });
    },
  });

  // Re-analyze complexity for existing questions (fixes AI misclassifications)
  const reanalyzeComplexity = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${id}/reanalyze-complexity`);
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      if (data.correctedCount > 0) {
        toast({ 
          title: "Complexity re-analyzed", 
          description: `Corrected ${data.correctedCount} of ${data.totalQuestions} questions.` 
        });
      } else {
        toast({ 
          title: "Complexity verified", 
          description: "All questions have correct complexity classifications." 
        });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to re-analyze complexity.", variant: "destructive" });
    },
  });

  const updateQuestion = (qId: string, updates: Partial<ScreeningQuestion>) => {
    const updatedQuestions = questions.map(q => q.id === qId ? { ...q, ...updates } : q);
    setQuestions(updatedQuestions);

    // Mark as edited if question text changed
    if (updates.question !== undefined) {
      const newEdited = new Set(editedQuestionIds);
      newEdited.add(qId);
      setEditedQuestionIds(newEdited);

    }

    setHasChanges(true);
    setApproved(false); // Unapprove if questions are edited
  };

  const moveQuestion = (qId: string, direction: "up" | "down") => {
    const questionIndex = questions.findIndex(q => q.id === qId);
    if (questionIndex === -1) return;

    const competencyId = questions[questionIndex].competencyId;
    const competencyQuestions = questions
      .filter(q => q.competencyId === competencyId)
      .sort((a, b) => a.order - b.order);

    const compIndex = competencyQuestions.findIndex(q => q.id === qId);
    if (compIndex === -1) return;

    const newIndex = direction === "up" ? compIndex - 1 : compIndex + 1;
    if (newIndex < 0 || newIndex >= competencyQuestions.length) return;

    // Swap orders
    const updatedQuestions = questions.map(q => {
      if (q.id === competencyQuestions[compIndex].id) {
        return { ...q, order: competencyQuestions[newIndex].order };
      }
      if (q.id === competencyQuestions[newIndex].id) {
        return { ...q, order: competencyQuestions[compIndex].order };
      }
      return q;
    });

    setQuestions(updatedQuestions);
    setHasChanges(true);
    setApproved(false);
  };

  const deleteQuestion = (qId: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== qId));
    setSelectedForRefine((prev) => {
      const next = new Set(prev);
      next.delete(qId);
      return next;
    });
    setEditedQuestionIds((prev) => {
      const next = new Set(prev);
      next.delete(qId);
      return next;
    });
    setSelectedQuestionId((prev) => (prev === qId ? null : prev));
    setHasChanges(true);
  };

  const toggleMandatory = (qId: string) => {
    const q = questions.find(q => q.id === qId);
    if (q) {
      console.log(`[Toggle] Question ${qId}: isMandatory ${q.isMandatory} -> ${!q.isMandatory}`);
      updateQuestion(qId, { isMandatory: !q.isMandatory });
    }
  };

  const getCompetencyName = (competencyId: string) => {
    return competencies.find(c => c.id === competencyId)?.name || "Unknown";
  };

  const groupedQuestions = competencies.map(comp => ({
    competency: comp,
    questions: questions.filter(q => q.competencyId === comp.id).sort((a, b) => a.order - b.order),
  }));

  const groupedIncluded = groupedQuestions
    .map(g => ({ ...g, questions: g.questions.filter(q => q.isMandatory) }))
    .filter(g => g.questions.length > 0);
  const groupedNotIncluded = groupedQuestions
    .map(g => ({ ...g, questions: g.questions.filter(q => !q.isMandatory) }))
    .filter(g => g.questions.length > 0);
  const includedCount = questions.filter(q => q.isMandatory).length;
  const notIncludedCount = questions.filter(q => !q.isMandatory).length;

  const questionCount = questions.length;

  const validateAllQuestions = (): boolean => {
    if (invalidQuestionIds.size > 0) {
      toast({
        title: "Invalid questions",
        description: `${invalidQuestionIds.size} question(s) are empty. Please fill in all questions.`,
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleApprove = () => {
    if (!validateAllQuestions()) {
      return;
    }
    setApproved(true);
    setEditModeAfterApproval(false);

    saveQuestions.mutate("questions_approved");

    toast({
      title: "Project Ready!",
      description: "Your screening criteria are finalized. You can now add candidates.",
    });
  };

  const handleSave = () => {
    if (!validateAllQuestions()) {
      return;
    }
    saveQuestions.mutate("draft");
  };

  // Helper to change step and persist to server
  const changeStep = (newStep: "edit" | "review") => {
    console.log("[changeStep] Changing to:", newStep);
    setStep(newStep);
    saveStep.mutate(newStep, {
      onSuccess: () => console.log("[changeStep] Saved successfully:", newStep),
      onError: (err) => console.error("[changeStep] Save failed:", err),
    });
  };

  const handleContinueToReview = () => {
    // In preview mode, just navigate to review step without AI analysis popup
    if (isPreviewMode) {
      setStep("review");
      return;
    }
    if (!validateAllQuestions()) return;
    // Trigger AI analysis and show confirmation modal
    setTimeAnalysis(null); // Reset previous analysis
    analyzeTime.mutate();
    setShowReviewConfirmModal(true);
  };

  const selectedQuestion = selectedQuestionId
    ? questions.find((q) => q.id === selectedQuestionId)
    : null;

  if (isLoading) {
    return (
      <DesktopOnlyGuard>
        <div className="min-h-screen page-gradient">
          <Header />
          <main className="max-w-6xl mx-auto px-8 py-12">
            <Skeleton className="h-8 w-64 mb-8 rounded-lg" />
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
            </div>
          </main>
        </div>
      </DesktopOnlyGuard>
    );
  }

  return (
    <ProjectLayout
      project={project}
      isLoading={isLoading}
      currentStage={2}
      stageDescription="Stage 2: Refine questions, review rubrics, then approve to go live"
      onStageClick={(s) => {
        if (s === 1) navigate(`/projects/${id}${isPreviewMode ? '?preview=true' : ''}`);
        if (s === 2 && step !== "review") {
          if (isPreviewMode) {
            setStep("review");
            return;
          }
          if (!validateAllQuestions()) return;
          // Trigger AI analysis and show confirmation modal
          setTimeAnalysis(null);
          analyzeTime.mutate();
          setShowReviewConfirmModal(true);
        }
        if (s === 3) navigate(`/projects/${id}/interviews${isPreviewMode ? '?preview=true' : ''}`);
      }}
      clickableStages={isLocked ? [2, 3] : [1, 2, 3]}
      questionCount={questionCount}
      actions={
        <div className="flex items-center gap-2">
          {isLocked ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setApproved(false);
                  setEditModeAfterApproval(true);
                  changeStep("edit");
                  // Also save status as draft so it stays unlocked after refresh
                  apiRequest("PATCH", `/api/projects/${id}`, { status: "draft" });
                }}
                className="rounded-xl gap-2 border-border/60"
                data-testid="button-edit-questions"
              >
                <Edit className="w-4 h-4" />
                Edit
              </Button>
              <Button
                variant="default"
                asChild
                className="rounded-xl gap-2 px-8 font-bold shadow-lg shadow-primary/25 bg-primary"
              >
                <Link href={`/projects/${id}/interviews`}>
                  View Interviews
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </Button>
            </>
          ) : approved && editModeAfterApproval && step === "edit" ? (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setEditModeAfterApproval(false);
                  changeStep("review");
                }}
                className="rounded-xl mr-2 text-muted-foreground hover:text-foreground"
              >
                Done
              </Button>
              <Button
                onClick={handleSave}
                disabled={saveQuestions.isPending}
                variant="outline"
                className="rounded-xl border-border/60 hover:bg-background/60 shadow-sm"
              >
                {saveQuestions.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Settings className="w-4 h-4 mr-2 text-muted-foreground" />}
                Save Draft
              </Button>
              <Button
                onClick={handleContinueToReview}
                disabled={questionCount === 0 || invalidQuestionIds.size > 0}
                className="rounded-xl gap-2 shadow-lg shadow-primary/20 px-6 font-semibold"
              >
                Next Step
                <ChevronRight className="w-4 h-4" />
              </Button>
            </>
          ) : step === "edit" ? (
            <>
              <Button
                onClick={handleSave}
                disabled={saveQuestions.isPending}
                variant="outline"
                className="rounded-xl border-border/60 hover:bg-background/60 shadow-sm"
                data-testid="button-save-questions"
              >
                {saveQuestions.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Settings className="w-4 h-4 mr-2 text-muted-foreground" />
                )}
                Save Draft
              </Button>
              <Button
                onClick={handleContinueToReview}
                disabled={questionCount === 0 || invalidQuestionIds.size > 0}
                className="rounded-xl gap-2 shadow-lg shadow-primary/20 px-6 font-semibold"
                data-testid="button-review-approve"
              >
                Next Step
                <ChevronRight className="w-4 h-4" />
              </Button>
            </>
          ) : step === "review" ? (
            <>
              <Button
                variant="ghost"
                onClick={() => changeStep("edit")}
                className="rounded-xl mr-2 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back to Edit
              </Button>
              <Button
                onClick={handleApprove}
                disabled={approved || questionCount === 0 || invalidQuestionIds.size > 0}
                className="rounded-xl gap-2 px-8 font-bold shadow-lg shadow-primary/25 transition-all"
                data-testid="button-approve-questions"
              >
                <ShieldCheck className="w-4 h-4" />
                Approve & Finish
              </Button>
            </>
          ) : (
            <Button
              variant="default"
              asChild
              className="rounded-xl gap-2 px-8 font-bold shadow-lg shadow-primary/25 bg-primary"
            >
              <Link href={`/projects/${id}/interviews`}>
                View Interviews
                <ChevronRight className="w-4 h-4" />
              </Link>
            </Button>
          )}
        </div>
      }
      subNavigation={
        <div className="flex flex-col items-center gap-3">
          {/* Tab navigation */}
          <div className="relative flex items-center bg-muted/30 backdrop-blur-xl p-1.5 rounded-2xl border border-border/40 shadow-xl shadow-black/5 ring-1 ring-white/10">
            {[
              { stepId: "edit" as const, label: "Refine Criteria", icon: Edit },
              { stepId: "review" as const, label: "Review & Approve", icon: ShieldCheck },
            ].map(({ stepId, label, icon: Icon }, i) => {
              const isActive = isLocked ? stepId === "review" : step === stepId;
              const isDisabled = isLocked 
                ? stepId === "edit" 
                : stepId === "review" && (invalidQuestionIds.size > 0 || questionCount === 0);
              return (
                <div key={stepId} className="relative flex-1 min-w-[180px]">
                  <button
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      if (isLocked && stepId === "edit") return;
                      if (stepId === "review") {
                        if (isPreviewMode) {
                          setStep("review");
                          return;
                        }
                        if (!validateAllQuestions()) return;
                        // Trigger AI analysis and show confirmation modal
                        setTimeAnalysis(null);
                        analyzeTime.mutate();
                        setShowReviewConfirmModal(true);
                        return;
                      }
                      changeStep(stepId);
                    }}
                    className={`relative z-10 flex items-center gap-2.5 px-6 py-3 rounded-xl text-xs font-black transition-all w-full justify-center uppercase tracking-widest whitespace-nowrap ${isActive
                      ? "text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                      }`}
                  >
                    <Icon className={`w-3.5 h-3.5 transition-all ${isActive ? "scale-110" : "opacity-60"}`} />
                    <span className="whitespace-nowrap">{label}</span>
                  </button>
                  {isActive && (
                    <motion.div
                      layoutId="active-nav-pill"
                      className="absolute inset-0 bg-primary rounded-xl shadow-lg shadow-primary/25 z-0"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      }
    >

      {invalidQuestionIds.size > 0 && (
        <Card className="mb-6 rounded-xl border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-4 h-4" />
              <p className="text-sm font-medium">
                {invalidQuestionIds.size} question(s) are invalid. Please fill in all question text before saving.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {refineQuestions.isPending && !isRefiningIndividual && (
        <div className="py-20">
          <RefiningQuestionsProgress isBatch={isRefiningSelected || (!isRefiningSelected && !isRefiningIndividual)} />
        </div>
      )}

      {regenerateQuestions.isPending && (
        <div className="py-20">
          <GeneratingQuestionsProgress />
        </div>
      )}

      {!regenerateQuestions.isPending && (!refineQuestions.isPending || isRefiningIndividual) && (
        questions.length === 0 ? (
          <Card className="rounded-3xl border-border/40 bg-card/50 backdrop-blur-sm p-20 shadow-xl shadow-primary/5">
            <div className="text-center max-w-md mx-auto">
              <div className="mx-auto w-24 h-24 rounded-[2rem] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-8 ring-4 ring-primary/5 shadow-inner">
                <Brain className="w-12 h-12 text-primary/60" />
              </div>
              <h3 className="text-2xl font-black mb-3 text-foreground/80 tracking-tight">No Questions Yet</h3>
              <p className="text-muted-foreground mb-10 leading-relaxed font-medium">
                We need a job description and some context to generate your tailored interview screening questions.
              </p>
              <Button asChild size="lg" className="rounded-2xl px-10 font-bold shadow-lg shadow-primary/20">
                <Link href={`/projects/${id}`}>Configure Setup First</Link>
              </Button>
            </div>
          </Card>
        ) : (step === "review" || isLocked) ? (
          <div className="grid gap-12 pb-20 max-w-4xl mx-auto">
            {[
              { sectionTitle: "Included in interview", sectionSubtitle: `${includedCount} question(s) • ${estimatedMinutes} min est.${configuredScreeningTime > 0 ? ` / ${configuredScreeningTime} min budget` : ""}`, grouped: groupedIncluded, icon: CheckCircle, iconClass: "text-green-600" },
              { sectionTitle: "Not included", sectionSubtitle: `${notIncludedCount} question(s)`, grouped: groupedNotIncluded, icon: AlertCircle, iconClass: "text-muted-foreground" },
            ].map(({ sectionTitle, sectionSubtitle, grouped, icon: SectionIcon, iconClass }) => {
              return (
                <div key={sectionTitle} className="space-y-6">
                  <div className="flex items-center gap-4 px-2">
                    <div className={cn("p-2 rounded-xl border", sectionTitle === "Included in interview" ? "bg-green-500/10 border-green-500/20" : "bg-muted/40 border-border/40")}>
                      <SectionIcon className={cn("w-5 h-5", iconClass)} />
                    </div>
                    <div className="flex flex-col">
                      <h2 className="text-xl font-black tracking-tight text-foreground/90 leading-none">{sectionTitle}</h2>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mt-1">{sectionSubtitle}</p>
                    </div>
                    <div className="flex-1 h-[1px] bg-gradient-to-r from-border/80 to-transparent ml-4" />
                  </div>

                  {grouped.map(({ competency, questions: compQuestions }, idx) => {
                    return (
                      <div key={competency.id} className="space-y-4">
                        <div className="flex items-center gap-4 px-2 mb-6">
                          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-primary-foreground font-black text-sm shadow-lg shadow-primary/10">
                            {idx + 1}
                          </div>
                          <div>
                            <h3 className="text-xl font-black tracking-tight text-foreground/90 leading-none mb-1">{competency.name}</h3>
                            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{competency.description}</p>
                          </div>
                        </div>

                        <div className="grid gap-4">
                          {compQuestions.map((q, qIdx) => {
                            const questionNo = sectionTitle === "Included in interview"
                              ? grouped.slice(0, idx).reduce((sum, g) => sum + g.questions.length, 0) + qIdx + 1
                              : null;
                            return (
                              <Card key={q.id} className="rounded-[2rem] border-border/40 shadow-xl shadow-black/5 overflow-hidden transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 group/card bg-card/60 backdrop-blur-sm">
                                <CardContent className="p-0">
                                  <div className="p-8 bg-gradient-to-br from-background to-muted/20 border-b border-border/40">
                                    <div className="flex items-start gap-3">
                                      {questionNo != null && (
                                        <span className="shrink-0 h-8 w-8 rounded-xl bg-primary/15 text-primary font-black text-sm flex items-center justify-center border border-primary/20">
                                          Q{questionNo}
                                        </span>
                                      )}
                                      <p className="font-extrabold text-lg text-foreground/90 leading-relaxed pr-6 flex-1">{q.question}</p>
                                    </div>
                                    
                                    {/* AI Insight & Notes */}
                                    {q.rubric.notes && (
                                      <div className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/10">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-2">
                                          <Sparkles className="w-3.5 h-3.5" /> AI Insight & Notes
                                        </h4>
                                        <p className="text-sm font-medium text-foreground/70 italic leading-relaxed">
                                          "{q.rubric.notes}"
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                  <div className="p-8 space-y-8">
                                    <div className="space-y-4">
                                      <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-4">
                                        <Brain className="w-4 h-4" /> Core Evaluation Logic
                                      </h4>
                                      <div className="p-5 rounded-[1.5rem] bg-muted/30 border border-border/40 transition-colors group-hover/card:bg-muted/40">
                                        <p className="text-sm font-medium text-foreground/70 leading-relaxed">
                                          {q.rubric.typicalReasoning || "No reasoning criteria provided."}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="grid sm:grid-cols-3 gap-8">
                                      <div className="space-y-4 p-5 rounded-[1.5rem] bg-green-500/[0.03] border border-green-500/10 hover:border-green-500/30 transition-all">
                                        <div className="flex items-center gap-2 text-green-600 font-black text-[10px] uppercase tracking-wider">
                                          <div className="h-2 w-2 rounded-full bg-green-500" />
                                          Strong Signals
                                        </div>
                                        <ul className="space-y-3">
                                          {q.rubric.goodSignals?.map((s, i) => (
                                            <li key={i} className="flex items-start gap-3 text-xs font-semibold text-muted-foreground leading-tight">
                                              <CheckCircle className="h-3 w-3 text-green-500/60 mt-0.5 shrink-0" />
                                              {s}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                      <div className="space-y-4 p-5 rounded-[1.5rem] bg-blue-500/[0.03] border border-blue-500/10 hover:border-blue-500/30 transition-all">
                                        <div className="flex items-center gap-2 text-blue-600 font-black text-[10px] uppercase tracking-wider">
                                          <div className="h-2 w-2 rounded-full bg-blue-500" />
                                          Acceptable
                                        </div>
                                        <ul className="space-y-3">
                                          {q.rubric.moderateSignals?.map((s, i) => (
                                            <li key={i} className="flex items-start gap-3 text-xs font-semibold text-muted-foreground leading-tight">
                                              <MessageSquare className="h-3 w-3 text-blue-500/60 mt-0.5 shrink-0" />
                                              {s}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                      <div className="space-y-4 p-5 rounded-[1.5rem] bg-amber-500/[0.03] border border-amber-500/10 hover:border-amber-500/30 transition-all">
                                        <div className="flex items-center gap-2 text-amber-600 font-black text-[10px] uppercase tracking-wider">
                                          <div className="h-2 w-2 rounded-full bg-amber-500" />
                                          Red Flags
                                        </div>
                                        <ul className="space-y-3">
                                          {q.rubric.poorSignals?.map((s, i) => (
                                            <li key={i} className="flex items-start gap-3 text-xs font-semibold text-muted-foreground leading-tight">
                                              <AlertCircle className="h-3 w-3 text-amber-500/60 mt-0.5 shrink-0" />
                                              {s}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    </div>
                                  </div>
                                  <div
                                    role={(isLocked || isPreviewMode) ? undefined : "button"}
                                    tabIndex={(isLocked || isPreviewMode) ? undefined : 0}
                                    onClick={(isLocked || isPreviewMode) ? undefined : () => toggleMandatory(q.id)}
                                    onKeyDown={(isLocked || isPreviewMode) ? undefined : (e) => e.key === "Enter" && toggleMandatory(q.id)}
                                    className={cn("px-8 py-5 bg-muted/40 border-t border-border/40 flex items-center justify-between", !(isLocked || isPreviewMode) && "group/toggle cursor-pointer")}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className={cn("h-6 w-6 rounded-lg flex items-center justify-center transition-all", q.isMandatory ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
                                        <ShieldCheck className="w-3.5 h-3.5" />
                                      </div>
                                      <span className={cn("text-sm font-black uppercase tracking-wider", q.isMandatory ? "text-primary" : "text-muted-foreground", !isLocked && "transition-colors group-hover/toggle:text-foreground text-opacity-60")}>
                                        {q.isMandatory ? "Included for interview" : "Excluded"}
                                      </span>
                                    </div>
                                    {isLocked || isPreviewMode ? (
                                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isPreviewMode ? "Preview" : "Locked"}</span>
                                    ) : (
                                      <Checkbox
                                        checked={q.isMandatory}
                                        onCheckedChange={() => toggleMandatory(q.id)}
                                        className="h-6 w-6 rounded-lg border-2 border-border/60 data-[state=checked]:bg-primary data-[state=checked]:border-primary transition-all duration-300 transform active:scale-90"
                                      />
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : !isLocked ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-6 lg:sticky lg:top-4">
              <div className="flex flex-col h-[calc(100vh-140px)] space-y-6">
                <div className="flex items-center justify-between gap-4 bg-background/80 backdrop-blur-md py-2 px-1">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-4">
                      <h2 className="text-xl font-extrabold tracking-tight">Screening Criteria</h2>
                      {!isPreviewMode && selectedForRefine.size > 0 && (
                        <Badge variant="secondary" className="rounded-full px-3 py-0.5 bg-primary/10 text-primary border-primary/20 animate-in zoom-in duration-300">
                          {selectedForRefine.size} Selected
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-medium">
                      Click a question to see its <span className="text-primary font-semibold">scoring rubric</span> →
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isPreviewMode && (selectedForRefine.size > 0 ? (
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-2 rounded-xl shadow-lg shadow-primary/20 bg-primary font-bold animate-in slide-in-from-right-4"
                        onClick={() => {
                          setIsRefiningSelected(true);
                          setIsRefiningIndividual(false);
                          setShowRefineDialog(true);
                        }}
                      >
                        <Sparkles className="w-4 h-4" />
                        Refine Selected
                      </Button>
                    ) : (
                      <Dialog open={showRefineDialog} onOpenChange={(open) => {
                        setShowRefineDialog(open);
                        if (!open) {
                          setIsRefiningIndividual(false);
                          setIsRefiningSelected(false);
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="gap-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 border border-primary/10 shadow-sm"
                            disabled={!project?.jdText || refineQuestions.isPending}
                            onClick={() => {
                              setIsRefiningIndividual(false);
                              setIsRefiningSelected(false);
                            }}
                          >
                            <Sparkles className="w-4 h-4" />
                            <span className="font-bold">AI Refine All</span>
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="rounded-2xl">
                          <DialogHeader>
                            <DialogTitle className="text-xl font-bold flex items-center gap-2">
                              <Brain className="w-5 h-5 text-primary" />
                              {isRefiningIndividual ? "Refine Question" : isRefiningSelected ? `Refine ${selectedForRefine.size} Questions` : "Refine All Questions"}
                            </DialogTitle>
                            <DialogDescription className="text-sm">
                              {isRefiningIndividual
                                ? "Provide specific instructions to improve this question."
                                : isRefiningSelected
                                  ? "Update only the selected questions. Their rubrics will be rebuilt."
                                  : "Update all questions based on your instructions. This will refine your existing list rather than generating new questions."}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            {isRefiningIndividual && selectedQuestion && (
                              <div className="p-4 bg-muted/50 rounded-xl text-sm font-medium border border-border/60 italic leading-relaxed text-muted-foreground">
                                "{selectedQuestion.question}"
                              </div>
                            )}
                            <Textarea
                              value={customInstructions}
                              onChange={(e) => setCustomInstructions(e.target.value)}
                              placeholder={isRefiningIndividual ? "Example: 'Make it more focused on security' or 'Ask for a specific example'..." : "Example: 'Make all questions more technical' or 'Focus more on React patterns'..."}
                              className="min-h-[140px] rounded-xl border-border/60 focus-visible:ring-primary/20 focus-visible:border-primary transition-all resize-none"
                            />
                          </div>
                          <DialogFooter className="gap-2 sm:gap-0">

                            <Button variant="ghost" className="rounded-xl" onClick={() => {
                              setShowRefineDialog(false);
                              setIsRefiningIndividual(false);
                              setIsRefiningSelected(false);
                            }}>Cancel</Button>
                            <Button
                              className="rounded-xl gap-2 font-bold px-6 shadow-lg shadow-primary/20"
                              onClick={() => refineQuestions.mutate({
                                instructions: customInstructions,
                                questionId: isRefiningIndividual ? selectedQuestionId || undefined : undefined,
                                // Use currently displayed questions when "Refine All" is clicked
                                questionIds: isRefiningIndividual ? undefined : (isRefiningSelected ? Array.from(selectedForRefine) : questions.map(q => q.id))
                              })}
                              disabled={refineQuestions.isPending}
                            >
                              {refineQuestions.isPending ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Processing...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-4 h-4" />
                                  {isRefiningIndividual ? "Refine Question" : isRefiningSelected ? "Refine Selected" : "Refine All"}
                                </>
                              )}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    ))}
                  </div>
                </div>

                <ScrollArea className="flex-1 pr-4 -mr-4 scrollbar-visible">
                  <div className="space-y-8 pb-12">
                    {groupedQuestions
                      .filter(g => g.questions && g.questions.length > 0)
                      .map(({ competency, questions: compQuestions }, activeIdx) => {
                        const previousQuestionsCount = groupedQuestions
                          .filter(g => g.questions && g.questions.length > 0)
                          .slice(0, activeIdx)
                          .reduce((acc, g) => acc + g.questions.length, 0);

                        return (
                          <div key={competency.id} className="space-y-4">
                            <div className="flex items-center gap-3 px-1 mb-2">
                              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary text-[11px] font-black text-white shadow-sm">
                                {activeIdx + 1}
                              </div>
                              <span className="font-black text-[11px] uppercase tracking-[0.2em] text-foreground/70">{competency.name}</span>
                              <div className="flex-1 h-[1px] bg-gradient-to-r from-border/80 to-transparent ml-2" />
                            </div>
                            <div className="grid gap-4">
                              {compQuestions.map((question, idx) => (
                                <div
                                  key={question.id}
                                  data-testid={`question-item-${question.id}`}
                                  onClick={() => setSelectedQuestionId(question.id)}
                                  className={`group relative rounded-2xl border transition-all duration-300 overflow-hidden cursor-pointer ${selectedQuestionId === question.id
                                    ? "ring-1 ring-primary border-primary shadow-xl shadow-primary/5 bg-background"
                                    : "hover:bg-card/80 hover:border-primary/30 bg-card border-border/40 shadow-sm"
                                    } ${invalidQuestionIds.has(question.id) ? "border-destructive bg-destructive/5" : ""}`}
                                >
                                  {selectedQuestionId === question.id && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                                  )}
                                  <div className="p-5">
                                    <div className="flex items-start gap-4">
                                      <div className="flex flex-col items-center gap-2 shrink-0">
                                        <div
                                          className={`flex h-6 w-6 items-center justify-center rounded-lg border-2 transition-all ${isPreviewMode ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} ${selectedForRefine.has(question.id)
                                            ? "bg-primary border-primary text-white shadow-lg shadow-primary/20"
                                            : "border-border/60 bg-muted hover:border-primary/40"
                                            }`}
                                          onClick={(e: React.MouseEvent) => {
                                            e.stopPropagation();
                                            if (isPreviewMode) return;
                                            const newSet = new Set(selectedForRefine);
                                            if (newSet.has(question.id)) newSet.delete(question.id);
                                            else newSet.add(question.id);
                                            setSelectedForRefine(newSet);
                                          }}
                                        >
                                          {selectedForRefine.has(question.id) ? (
                                            <Sparkles className="h-3 w-3 fill-current" />
                                          ) : (
                                            <span className="text-[10px] font-black text-muted-foreground">
                                              {previousQuestionsCount + idx + 1}
                                            </span>
                                          )}
                                        </div>
                                        {!isPreviewMode && (
                                          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7 rounded-lg p-0 hover:bg-primary/10 hover:text-primary disabled:opacity-20"
                                              onClick={(e: React.MouseEvent) => {
                                                e.stopPropagation();
                                                moveQuestion(question.id, "up");
                                              }}
                                              disabled={activeIdx === 0 && idx === 0}
                                            >
                                              <ArrowUp className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7 rounded-lg p-0 hover:bg-primary/10 hover:text-primary disabled:opacity-20"
                                              onClick={(e: React.MouseEvent) => {
                                                e.stopPropagation();
                                                moveQuestion(question.id, "down");
                                              }}
                                              disabled={activeIdx === (groupedQuestions.filter(g => g.questions.length > 0).length - 1) && idx === (compQuestions.length - 1)}
                                            >
                                              <ArrowDown className="w-3.5 h-3.5" />
                                            </Button>
                                          </div>
                                        )}
                                      </div>

                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-4 mb-3">
                                          <div className="flex-1 min-w-0">
                                            <AutoResizeTextarea
                                              value={question.question ?? ""}
                                              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => !isPreviewMode && updateQuestion(question.id, { question: e.target.value })}
                                              onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                              readOnly={isPreviewMode}
                                              className={cn(
                                                "w-full text-base font-semibold leading-relaxed tracking-tight",
                                                invalidQuestionIds.has(question.id) ? "text-destructive" : "text-foreground/90",
                                                isPreviewMode && "cursor-not-allowed"
                                              )}
                                              placeholder="Enter question text..."
                                            />
                                            {/* Complexity badge */}
                                            {(question as any).complexity && (
                                              <div className="flex items-center gap-2 mt-2">
                                                <span className={cn(
                                                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                                  (question as any).complexity === "simple" ? "bg-green-500/10 text-green-600" :
                                                  (question as any).complexity === "complex" ? "bg-amber-500/10 text-amber-600" :
                                                  "bg-blue-500/10 text-blue-600"
                                                )}>
                                                  {(question as any).complexity} • {TIME_ESTIMATES[((question as any).complexity) as keyof typeof TIME_ESTIMATES] || 2.5}m
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                          {!isPreviewMode && (
                                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                              <TooltipProvider>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Button
                                                      variant="ghost"
                                                      size="icon"
                                                      className="h-9 w-9 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 border border-transparent hover:border-primary/20"
                                                      onClick={(e: React.MouseEvent) => {
                                                        e.stopPropagation();
                                                        setSelectedQuestionId(question.id);
                                                        setIsRefiningIndividual(true);
                                                        setShowRefineDialog(true);
                                                      }}
                                                    >
                                                      <Sparkles className="w-4 h-4" />
                                                    </Button>
                                                  </TooltipTrigger>
                                                  <TooltipContent>AI Refine</TooltipContent>
                                                </Tooltip>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Button
                                                      variant="ghost"
                                                      size="icon"
                                                      className="h-9 w-9 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20"
                                                      onClick={(e: React.MouseEvent) => {
                                                        e.stopPropagation();
                                                        setDeleteQuestionConfirm({
                                                          id: question.id,
                                                          preview: (question.question || "").trim().slice(0, 120),
                                                        });
                                                      }}
                                                    >
                                                      <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                  </TooltipTrigger>
                                                  <TooltipContent>Delete</TooltipContent>
                                                </Tooltip>
                                              </TooltipProvider>
                                            </div>
                                          )}
                                        </div>

                                        <div className="flex items-center justify-between border-t border-border/40 pt-4">
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <div
                                                  className={cn(
                                                    "inline-flex items-center gap-2.5 rounded-xl border-2 border-border bg-muted/20 px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                                                    isPreviewMode ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-muted/40 hover:border-primary/40"
                                                  )}
                                                  onClick={(e: React.MouseEvent) => {
                                                    e.stopPropagation();
                                                    if (isPreviewMode) return;
                                                    toggleMandatory(question.id);
                                                  }}
                                                >
                                                  <Checkbox
                                                    checked={question.isMandatory}
                                                    onCheckedChange={() => !isPreviewMode && toggleMandatory(question.id)}
                                                    disabled={isPreviewMode}
                                                    className="h-5 w-5 shrink-0 rounded border-2 border-foreground/40 bg-background data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                                  />
                                                  <span className={`text-xs font-bold select-none transition-colors ${question.isMandatory ? "text-primary" : "text-foreground/80"}`}>
                                                    {question.isMandatory ? "Included in interview" : "Exclude from interview"}
                                                  </span>
                                                </div>
                                              </TooltipTrigger>
                                              <TooltipContent side="top" align="start" sideOffset={6} className="font-medium">
                                                {isPreviewMode ? "Disabled in preview mode" : "Click here to include"}
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>

                                          <div className="flex items-center gap-3">
                                            {!editedQuestionIds.has(question.id) ? (
                                              <Badge
                                                variant="outline"
                                                className={cn(
                                                  "bg-primary/5 text-primary border-primary/10 gap-1.5 py-0.5 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors",
                                                  isPreviewMode ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-primary/10"
                                                )}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (isPreviewMode) return;
                                                  setSelectedQuestionId(question.id);
                                                  setIsRefiningIndividual(true);
                                                  setShowRefineDialog(true);
                                                }}
                                              >
                                                <Sparkles className="w-3 h-3" /> {isPreviewMode ? "AI Generated" : "AI Refine"}
                                              </Badge>
                                            ) : (
                                              <Badge variant="outline" className="bg-amber-500/5 text-amber-600 border-amber-500/10 gap-1.5 py-0.5 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                                <Edit className="w-3 h-3" /> User Edited
                                              </Badge>
                                            )}
                                            <span 
                                              className={`text-xs font-semibold transition-colors cursor-pointer ${selectedQuestionId === question.id ? "text-primary" : "text-primary/60 hover:text-primary"}`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedQuestionId(question.id);
                                              }}
                                            >
                                              scoring rubric →
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </ScrollArea>
              </div>
            </div>

            <div className="lg:col-span-6 lg:sticky lg:top-4">
              <Card className="rounded-3xl border-border/50 shadow-2xl shadow-primary/5 overflow-hidden bg-background flex flex-col h-[calc(100vh-140px)]">
                <div className="bg-primary/[0.03] border-b border-border/50 p-6">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle className="text-sm font-black uppercase tracking-[0.15em] text-foreground/80">Evaluation Rubric</CardTitle>
                  </div>
                  <CardDescription className="text-xs font-medium text-muted-foreground/70 ml-11">
                    {selectedQuestion
                      ? "AI-generated signals for scoring answers"
                      : "Click any question on the left to see how answers will be scored"}
                  </CardDescription>
                </div>

                <ScrollArea className="flex-1 pr-4 -mr-4 scrollbar-visible">
                  {selectedQuestion ? (
                    <CardContent className="space-y-8 p-8">
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground/60 flex items-center gap-2">
                          <Brain className="w-3 h-3" /> Typical Reasoning
                        </h4>
                        <div className="p-4 rounded-2xl bg-muted/30 border border-border/40">
                          <p className="text-sm leading-relaxed font-medium text-foreground/80">
                            {selectedQuestion.rubric.typicalReasoning || "—"}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div className="space-y-3">
                          <h4 className="text-[10px] font-black uppercase tracking-[0.1em] text-green-600/80 flex items-center gap-2">
                            <CheckCircle className="w-3.5 h-3.5" /> Good Signals
                          </h4>
                          <div className="grid gap-2">
                            {selectedQuestion.rubric.goodSignals?.map((s, i) => (
                              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-green-500/[0.03] border border-green-500/10 group transition-all hover:bg-green-500/[0.06]">
                                <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-500 text-[10px] font-black text-white shadow-sm shadow-green-500/20">
                                  <CheckCircle className="h-2.5 w-2.5" />
                                </div>
                                <span className="text-sm font-medium text-foreground/80 leading-snug">{s}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h4 className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-600/80 flex items-center gap-2">
                            <MessageSquare className="w-3.5 h-3.5" /> Moderate Signals
                          </h4>
                          <div className="grid gap-2">
                            {selectedQuestion.rubric.moderateSignals?.map((s, i) => (
                              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-blue-500/[0.03] border border-blue-500/10 group transition-all hover:bg-blue-500/[0.06]">
                                <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-black text-white shadow-sm shadow-blue-500/20">
                                  <MessageSquare className="h-2.5 w-2.5" />
                                </div>
                                <span className="text-sm font-medium text-foreground/80 leading-snug">{s}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h4 className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-600/80 flex items-center gap-2">
                            <AlertCircle className="w-3.5 h-3.5" /> Red Flags / Poor
                          </h4>
                          <div className="grid gap-2">
                            {selectedQuestion.rubric.poorSignals?.map((s, i) => (
                              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/[0.03] border border-amber-500/10 group transition-all hover:bg-amber-500/[0.06]">
                                <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-black text-white shadow-sm shadow-amber-500/20">
                                  <X className="h-2.5 w-2.5" />
                                </div>
                                <span className="text-sm font-medium text-foreground/80 leading-snug">{s}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {selectedQuestion.rubric.notes && (
                        <div className="pt-6 border-t border-border/40">
                          <div className="flex items-center gap-2 mb-3">
                            <Sparkles className="w-3.5 h-3.5 text-primary" />
                            <h4 className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground/60">AI Insight & Notes</h4>
                          </div>
                          <p className="text-xs font-medium italic text-muted-foreground leading-relaxed px-1">
                            "{selectedQuestion.rubric.notes}"
                          </p>
                        </div>
                      )}
                    </CardContent>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center p-12 text-center space-y-6">
                      <div className="h-24 w-24 rounded-3xl bg-primary/5 border-2 border-dashed border-primary/20 flex items-center justify-center">
                        <ShieldCheck className="h-12 w-12 text-primary/30" />
                      </div>
                      <div className="space-y-2 max-w-[260px]">
                        <h4 className="font-bold text-foreground/80 text-base">View scoring rubric</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Click any <strong className="text-foreground/70">question card on the left</strong> to see how candidate answers will be scored — good signals, moderate signals, and red flags.
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground/80 font-medium flex items-center gap-1.5">
                        <span className="inline-block w-5 h-5 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-[10px] font-black">←</span>
                        Questions are clickable
                      </p>
                    </div>
                  )}
                </ScrollArea>

                {selectedQuestion && !isPreviewMode && (
                  <div className="p-4 bg-muted/30 border-t border-border/40">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl gap-2 font-bold text-xs h-9 bg-background border-border/60 shadow-sm"
                      onClick={() => {
                        setIsRefiningIndividual(true);
                        setShowRefineDialog(true);
                      }}
                    >
                      <Sparkles className="w-3 h-3" />
                      Refine This Question
                    </Button>
                  </div>
                )}
              </Card>
            </div>
          </div>
        ) : null
      )}
      {/* Confirmation Modal for Review & Approve with AI Analysis - Hidden in preview mode */}
      <AlertDialog open={showReviewConfirmModal && !isPreviewMode} onOpenChange={(open) => !isPreviewMode && setShowReviewConfirmModal(open)}>
        <AlertDialogContent className="rounded-2xl max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-black flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Time Analysis
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                {analyzeTime.isPending ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground font-medium">Analyzing questions with AI...</p>
                  </div>
                ) : (
                  (() => {
                    // ALWAYS use real-time calculation for accurate, dynamic values
                    const currentEstimate = calculateRealTimeEstimate();
                    const currentMinutes = currentEstimate.total;
                    const currentCounts = currentEstimate.counts;
                    const isWithinBudget = configuredScreeningTime === 0 || currentMinutes <= configuredScreeningTime;
                    const overBudgetBy = Math.max(0, currentMinutes - configuredScreeningTime);
                    
                    // Generate dynamic summary from current selection
                    const dynamicSummary = `The screening consists of ${currentCounts.simple} simple, ${currentCounts.moderate} moderate, and ${currentCounts.complex} complex questions, totaling ${currentMinutes} minutes of pure Q&A time. This calculation strictly covers the question-and-answer period and excludes introductions, follow-up probes, or closing remarks.`;
                    
                    return (
                      <>
                        {/* Time Summary - ALWAYS uses real-time calculation */}
                        <div className={cn(
                          "flex items-center gap-3 p-4 rounded-xl border",
                          isWithinBudget 
                            ? "bg-green-500/5 border-green-500/20" 
                            : "bg-amber-500/5 border-amber-500/20"
                        )}>
                          <Clock className={cn("w-6 h-6", isWithinBudget ? "text-green-600" : "text-amber-600")} />
                          <div className="flex-1">
                            <p className="font-bold text-foreground text-lg">
                              {currentMinutes} min estimated
                            </p>
                            <p className="text-sm text-muted-foreground">
                              for {includedQuestionsCount} included questions
                            </p>
                            {configuredScreeningTime > 0 && (
                              <p className={cn(
                                "text-sm mt-1 font-medium",
                                isWithinBudget ? "text-green-600" : "text-amber-600"
                              )}>
                                {isWithinBudget 
                                  ? `✓ Within your ${configuredScreeningTime} min budget`
                                  : `⚠️ Exceeds your ${configuredScreeningTime} min budget by ${overBudgetBy.toFixed(1)} min`
                                }
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Dynamic Summary - ALWAYS uses real-time calculation */}
                        <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                          <p className="text-sm text-foreground font-medium">{dynamicSummary}</p>
                        </div>

                        {/* Question Breakdown (collapsible) - Uses current questions */}
                        {includedQuestionsCount > 0 && (
                          <details className="group">
                            <summary className="text-xs font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-2">
                              <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                              View breakdown by question
                            </summary>
                            <div className="mt-3 space-y-2 max-h-[200px] overflow-y-auto">
                              {questions.filter(q => q.isMandatory).map((q, idx) => {
                                const complexity = (q as any).complexity || "moderate";
                                const minutes = TIME_ESTIMATES[complexity as keyof typeof TIME_ESTIMATES] || 2.5;
                                return (
                                  <div key={q.id} className="flex items-start gap-2 p-2 rounded-lg bg-background/50 border border-border/20 text-xs">
                                    <span className={cn(
                                      "shrink-0 px-1.5 py-0.5 rounded font-bold uppercase",
                                      complexity === "simple" ? "bg-green-500/10 text-green-600" :
                                      complexity === "complex" ? "bg-amber-500/10 text-amber-600" :
                                      "bg-blue-500/10 text-blue-600"
                                    )}>
                                      {minutes}m
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-foreground/80 truncate">{q.question.substring(0, 60)}...</p>
                                      <p className="text-muted-foreground text-[10px] mt-0.5">{complexity} complexity</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        )}

                        {/* Dynamic AI Recommendation */}
                        <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
                          <p className="text-xs font-bold uppercase tracking-wider text-primary mb-1">AI Recommendation</p>
                          <p className="text-sm text-foreground">
                            {configuredScreeningTime === 0
                              ? `Your interview will take approximately ${currentMinutes} minutes for the Q&A portion.`
                              : isWithinBudget
                                ? `At ${currentMinutes} minutes, you are within your ${configuredScreeningTime}-minute Q&A budget with ${(configuredScreeningTime - currentMinutes).toFixed(1)} minutes remaining. The timing is well-optimized.`
                                : `At ${currentMinutes} minutes, you exceed your ${configuredScreeningTime}-minute Q&A budget by ${overBudgetBy.toFixed(1)} minutes. Consider removing ${Math.ceil(overBudgetBy / 2.5)} questions to fit within budget.`
                            }
                          </p>
                        </div>
                      </>
                    );
                  })()
                )}

                <p className="text-muted-foreground text-sm">
                  Are you ready to proceed to Review & Approve?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="rounded-xl font-bold"
              disabled={analyzeTime.isPending}
              onClick={() => {
                setShowReviewConfirmModal(false);
                changeStep("review");
                setSelectedQuestionId(null);
              }}
            >
              Yes, Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteQuestionConfirm} onOpenChange={(open) => !open && setDeleteQuestionConfirm(null)}>
        <AlertDialogContent className="rounded-2xl max-w-lg">
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle className="text-xl font-black tracking-tight">Delete this question?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                  This will permanently delete the question. This action can’t be undone.
                </p>
                {deleteQuestionConfirm?.preview ? (
                  <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
                    <p className="text-sm font-semibold text-foreground/80 leading-relaxed">
                      {deleteQuestionConfirm.preview}
                      {deleteQuestionConfirm.preview.length >= 120 ? "…" : ""}
                    </p>
                  </div>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl font-black bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteQuestionConfirm) return;
                const delId = deleteQuestionConfirm.id;
                setDeleteQuestionConfirm(null);
                deleteQuestion(delId);
              }}
            >
              Yes, delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProjectLayout>
  );
}
