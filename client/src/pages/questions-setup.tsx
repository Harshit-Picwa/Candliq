import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, ScreeningQuestion, Competency } from "@shared/schema";
import { ArrowLeft, Trash2, CheckCircle, AlertCircle, Loader2, MessageSquare, Edit, ShieldCheck, ArrowUp, ArrowDown, Sparkles, ChevronRight, ChevronLeft, User, Settings, Brain, X, Rocket } from "lucide-react";
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
  const { toast } = useToast();

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
  const [invalidQuestionIds, setInvalidQuestionIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"edit" | "review" | "launch">("edit");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [isRefiningIndividual, setIsRefiningIndividual] = useState(false);
  const [selectedForRefine, setSelectedForRefine] = useState<Set<string>>(new Set());
  const [isRefiningSelected, setIsRefiningSelected] = useState(false);

  useEffect(() => {
    if (project) {
      const loadedQuestions = project.screeningQuestionsJson || [];
      const loadedCompetencies = project.competencyRubricJson || [];
      setQuestions(loadedQuestions);
      setCompetencies(loadedCompetencies);
      setSelectedQuestionId(null);
      const invalid = new Set<string>();
      loadedQuestions.forEach(q => {
        if (!q.question.trim()) invalid.add(q.id);
      });
      setInvalidQuestionIds(invalid);
      setEditedQuestionIds(new Set());
    }
  }, [project]);

  const saveQuestions = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/projects/${id}`, {
        screeningQuestionsJson: questions,
        competencyRubricJson: competencies,
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
      return apiRequest("POST", `/api/projects/${id}/generate-questions`);
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

  const updateQuestion = (qId: string, updates: Partial<ScreeningQuestion>) => {
    const updatedQuestions = questions.map(q => q.id === qId ? { ...q, ...updates } : q);
    setQuestions(updatedQuestions);
    
    // Mark as edited if question text changed
    if (updates.question !== undefined) {
      const newEdited = new Set(editedQuestionIds);
      newEdited.add(qId);
      setEditedQuestionIds(newEdited);
      
      // Validate question text
      const question = updatedQuestions.find(q => q.id === qId);
      if (question && !question.question.trim()) {
        const newInvalid = new Set(invalidQuestionIds);
        newInvalid.add(qId);
        setInvalidQuestionIds(newInvalid);
      } else {
        const newInvalid = new Set(invalidQuestionIds);
        newInvalid.delete(qId);
        setInvalidQuestionIds(newInvalid);
      }
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
    setQuestions(questions.filter(q => q.id !== qId));
    setHasChanges(true);
  };

  const toggleMandatory = (qId: string) => {
    const q = questions.find(q => q.id === qId);
    if (q) {
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

  const questionCount = questions.length;

  const validateAllQuestions = (): boolean => {
    const invalid = questions.filter(q => !q.question.trim());
    if (invalid.length > 0) {
      setInvalidQuestionIds(new Set(invalid.map(q => q.id)));
      toast({
        title: "Invalid questions",
        description: `${invalid.length} question(s) are empty. Please fill in all questions.`,
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
    setStep("launch");
    toast({ 
      title: "Project Ready!", 
      description: "Your screening criteria are finalized. You can now start interviewing candidates.",
    });
  };

  const handleSave = () => {
    if (!validateAllQuestions()) {
      return;
    }
    saveQuestions.mutate();
  };

  const handleContinueToReview = () => {
    if (!validateAllQuestions()) return;
    setStep("review");
    setSelectedQuestionId(null);
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
    <DesktopOnlyGuard>
      <div className="min-h-screen page-gradient">
        <Header />
        <main className="max-w-6xl mx-auto px-8 py-12">
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" size="icon" asChild className="rounded-full hover:bg-background/80">
              <Link href={`/projects/${id}`}>
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-bold py-0 h-5 px-2 rounded-md bg-background/50 border-primary/20 text-primary/80">
                  Project Questions
                </Badge>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground/90">{project?.title}</h1>
              <div className="flex items-center gap-3 mt-1.5">
                <div className="flex -space-x-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-6 w-6 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground overflow-hidden">
                      <User className="h-3 w-3" />
                    </div>
                  ))}
                </div>
                <p className="text-muted-foreground text-sm font-medium">
                  {questionCount} question{questionCount !== 1 ? "s" : ""} generated
                </p>
                {approved && (
                  <Badge className="gap-1 bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20 rounded-full py-0 h-6">
                    <CheckCircle className="w-3 h-3" />
                    Finalized
                  </Badge>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {step === "edit" ? (
                <>
                  <Button
                    onClick={handleSave}
                    disabled={saveQuestions.isPending || !hasChanges || invalidQuestionIds.size > 0}
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
                    onClick={() => setStep("edit")}
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
          </div>

          <div className="flex items-center justify-center mb-16">
            <div className="relative flex items-center bg-muted/20 backdrop-blur-xl p-1.5 rounded-[2.5rem] border border-border/40 shadow-inner group">
              {[
                { stepId: "edit" as const, label: "Refine Criteria", icon: Edit },
                { stepId: "review" as const, label: "Review & Approve", icon: ShieldCheck },
                { stepId: "launch" as const, label: "Ready", icon: Rocket },
              ].map(({ stepId, label, icon: Icon }, i) => (
                <button
                  key={stepId}
                  type="button"
                  disabled={stepId === "launch" && !approved}
                  onClick={() => {
                    if (stepId === "review" && !validateAllQuestions()) return;
                    if (stepId === "launch" && !approved) return;
                    setStep(stepId);
                  }}
                  className={`relative flex items-center gap-3 px-8 py-4 rounded-[2rem] text-sm font-black transition-all duration-500 z-10 ${
                    step === stepId
                      ? "text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-30 disabled:hover:bg-transparent"
                  }`}
                >
                  {step === stepId && (
                    <div className="absolute inset-0 bg-primary shadow-2xl shadow-primary/30 rounded-[2rem] -z-10 animate-in fade-in zoom-in-95 duration-500" />
                  )}
                  <div className={`flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-black transition-all duration-500 ${
                    step === stepId ? "bg-white/20 text-white rotate-[360deg]" : "bg-muted text-muted-foreground"
                  }`}>
                    {i + 1}
                  </div>
                  <Icon className={`w-4 h-4 transition-all duration-500 ${step === stepId ? "scale-110" : "opacity-60"}`} />
                  <span className="tracking-tight uppercase tracking-[0.05em]">{label}</span>
                </button>
              ))}
            </div>
          </div>

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
          {questions.length === 0 ? (
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
          ) : step === "launch" ? (
            <div className="max-w-3xl mx-auto py-12 animate-in fade-in zoom-in duration-700">
              <Card className="rounded-[3rem] border-border/40 bg-card/50 backdrop-blur-xl p-12 shadow-2xl shadow-primary/10 overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12">
                  <Rocket className="w-64 h-64 text-primary" />
                </div>
                
                <div className="relative z-10 text-center space-y-8">
                  <div className="mx-auto w-24 h-24 rounded-[2.5rem] bg-green-500/10 flex items-center justify-center mb-6 ring-8 ring-green-500/5 shadow-inner animate-bounce duration-[3000ms]">
                    <CheckCircle className="w-12 h-12 text-green-500" />
                  </div>
                  
                  <div className="space-y-4">
                    <h2 className="text-4xl font-black tracking-tight text-foreground/90">Project is Live!</h2>
                    <p className="text-xl text-muted-foreground font-medium max-w-lg mx-auto leading-relaxed">
                      Your screening criteria and evaluation rubrics are finalized. You're ready to start interviewing candidates.
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4 pt-8">
                    <Card className="rounded-3xl border-border/40 bg-background/50 p-8 hover:border-primary/40 hover:shadow-lg transition-all group cursor-pointer" asChild>
                      <Link href={`/projects/${id}/interviews`}>
                        <div className="space-y-4">
                          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <User className="w-6 h-6 text-primary" />
                          </div>
                          <div className="text-left">
                            <h4 className="font-black text-lg">Add Candidates</h4>
                            <p className="text-sm text-muted-foreground font-medium">Invite applicants to start their screening session.</p>
                          </div>
                        </div>
                      </Link>
                    </Card>

                    <Card className="rounded-3xl border-border/40 bg-background/50 p-8 hover:border-primary/40 hover:shadow-lg transition-all group cursor-pointer" asChild>
                      <Link href="/dashboard">
                        <div className="space-y-4">
                          <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Settings className="w-6 h-6 text-muted-foreground" />
                          </div>
                          <div className="text-left">
                            <h4 className="font-black text-lg">Project Dashboard</h4>
                            <p className="text-sm text-muted-foreground font-medium">View your workspace and manage other projects.</p>
                          </div>
                        </div>
                      </Link>
                    </Card>
                  </div>

                  <div className="pt-8 border-t border-border/40">
                    <div className="flex items-center justify-center gap-2 text-sm font-bold text-muted-foreground/60 uppercase tracking-widest">
                      <Sparkles className="w-4 h-4" />
                      Powered by Candiq AI
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          ) : step === "review" ? (
            <div className="grid gap-10 pb-20 max-w-4xl mx-auto">
              {groupedQuestions.map(({ competency, questions: compQuestions }, idx) => {
                const selectedCompQuestions = compQuestions.filter(q => q.isMandatory);
                if (selectedCompQuestions.length === 0) return null;

                return (
                  <div key={competency.id} className="space-y-6">
                    <div className="flex items-center gap-3 px-2">
                      <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black text-xs">
                        {idx + 1}
                      </div>
                      <div>
                        <h3 className="text-lg font-black tracking-tight text-foreground/90 leading-none mb-1">{competency.name}</h3>
                        <p className="text-xs text-muted-foreground font-medium">{competency.description}</p>
                      </div>
                    </div>
                    
                    <div className="grid gap-4">
                      {selectedCompQuestions.map((q) => (
                        <Card key={q.id} className="rounded-2xl border-border/40 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group">
                          <CardContent className="p-0">
                            <div className="p-6 bg-card border-b border-border/30">
                              <p className="font-bold text-base text-foreground/90 leading-relaxed">{q.question}</p>
                            </div>
                            <div className="p-6 bg-muted/20 space-y-6">
                              <div className="space-y-3">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2">
                                  <Brain className="w-3.5 h-3.5" /> Core Reasoning
                                </h4>
                                <p className="text-sm font-medium text-foreground/70 leading-relaxed pl-5">
                                  {q.rubric.typicalReasoning || "No reasoning criteria provided."}
                                </p>
                              </div>
                              
                              <div className="grid sm:grid-cols-3 gap-6">
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 text-green-600">
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Good Signal</span>
                                  </div>
                                  <ul className="space-y-2 pl-1">
                                    {q.rubric.goodSignals?.map((s, i) => (
                                      <li key={i} className="flex items-start gap-2 text-xs font-medium text-muted-foreground">
                                        <div className="h-1 w-1 rounded-full bg-green-500 mt-1.5 shrink-0" />
                                        {s}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 text-blue-600">
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Moderate</span>
                                  </div>
                                  <ul className="space-y-2 pl-1">
                                    {q.rubric.moderateSignals?.map((s, i) => (
                                      <li key={i} className="flex items-start gap-2 text-xs font-medium text-muted-foreground">
                                        <div className="h-1 w-1 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                                        {s}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 text-amber-600">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Poor / Flag</span>
                                  </div>
                                  <ul className="space-y-2 pl-1">
                                    {q.rubric.poorSignals?.map((s, i) => (
                                      <li key={i} className="flex items-start gap-2 text-xs font-medium text-muted-foreground">
                                        <div className="h-1 w-1 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                                        {s}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-6 lg:sticky lg:top-4">
                <div className="flex flex-col h-[calc(100vh-140px)] space-y-6">
                  <div className="flex items-center justify-between gap-4 bg-background/80 backdrop-blur-md py-2 px-1">
                    <div className="flex items-center gap-4">
                      <h2 className="text-xl font-extrabold tracking-tight">Screening Criteria</h2>
                      {selectedForRefine.size > 0 && (
                        <Badge variant="secondary" className="rounded-full px-3 py-0.5 bg-primary/10 text-primary border-primary/20 animate-in zoom-in duration-300">
                          {selectedForRefine.size} Selected
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedForRefine.size > 0 ? (
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
                                    : "Update the generation logic for all questions. This will rebuild your screening list."}
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
                                  questionIds: isRefiningSelected ? Array.from(selectedForRefine) : undefined
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
                                    {isRefiningIndividual || isRefiningSelected ? "Refine Now" : "Regenerate All"}
                                  </>
                                )}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}
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
                                    className={`group relative rounded-2xl border transition-all duration-300 overflow-hidden ${
                                      selectedQuestionId === question.id
                                        ? "ring-1 ring-primary border-primary shadow-xl shadow-primary/5 bg-background"
                                        : "hover:bg-card/80 bg-card border-border/40 shadow-sm"
                                    } ${invalidQuestionIds.has(question.id) ? "border-destructive bg-destructive/5" : ""}`}
                                  >
                                    {selectedQuestionId === question.id && (
                                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                                    )}
                                    <div className="p-5">
                                      <div className="flex items-start gap-4">
                                        <div className="flex flex-col items-center gap-2 shrink-0">
                                          <div 
                                            className={`flex h-6 w-6 items-center justify-center rounded-lg border-2 transition-all cursor-pointer ${
                                              selectedForRefine.has(question.id)
                                                ? "bg-primary border-primary text-white shadow-lg shadow-primary/20"
                                                : "border-border/60 bg-muted hover:border-primary/40"
                                            }`}
                                            onClick={(e) => {
                                              e.stopPropagation();
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
                                          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7 rounded-lg p-0 hover:bg-primary/10 hover:text-primary disabled:opacity-20"
                                              onClick={(e) => {
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
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                moveQuestion(question.id, "down");
                                              }}
                                              disabled={activeIdx === (groupedQuestions.filter(g => g.questions.length > 0).length - 1) && idx === (compQuestions.length - 1)}
                                            >
                                              <ArrowDown className="w-3.5 h-3.5" />
                                            </Button>
                                          </div>
                                        </div>
                                        
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-start justify-between gap-4 mb-3">
                                            <AutoResizeTextarea
                                              value={question.question}
                                              onChange={(e) => updateQuestion(question.id, { question: e.target.value })}
                                              onClick={(e) => e.stopPropagation()}
                                              className={`w-full text-base font-semibold leading-relaxed tracking-tight ${
                                                invalidQuestionIds.has(question.id) ? "text-destructive" : "text-foreground/90"
                                              }`}
                                              placeholder="Enter question text..."
                                            />
                                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                              <TooltipProvider>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Button
                                                      variant="ghost"
                                                      size="icon"
                                                      className="h-9 w-9 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 border border-transparent hover:border-primary/20"
                                                      onClick={(e) => {
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
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        deleteQuestion(question.id);
                                                      }}
                                                    >
                                                      <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                  </TooltipTrigger>
                                                  <TooltipContent>Delete</TooltipContent>
                                                </Tooltip>
                                              </TooltipProvider>
                                            </div>
                                          </div>
                                          
                                          <div className="flex items-center justify-between border-t border-border/40 pt-4">
                                            <div 
                                              className="flex items-center gap-2.5 cursor-pointer group/check"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleMandatory(question.id);
                                              }}
                                            >
                                              <Checkbox
                                                checked={question.isMandatory}
                                                onCheckedChange={() => toggleMandatory(question.id)}
                                                className="h-4.5 w-4.5 rounded-md data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                              />
                                              <span className={`text-xs font-bold transition-colors ${
                                                question.isMandatory ? "text-primary" : "text-muted-foreground group-hover/check:text-foreground"
                                              }`}>
                                                {question.isMandatory ? "Included in interview" : "Exclude from interview"}
                                              </span>
                                            </div>
                                            
                                            <div className="flex items-center gap-2">
                                              {!editedQuestionIds.has(question.id) ? (
                                                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/10 gap-1.5 py-0.5 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                                  <Sparkles className="w-3 h-3" /> AI Generated
                                                </Badge>
                                              ) : (
                                                <Badge variant="outline" className="bg-amber-500/5 text-amber-600 border-amber-500/10 gap-1.5 py-0.5 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                                  <Edit className="w-3 h-3" /> User Edited
                                                </Badge>
                                              )}
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
                        : "Select a question on the left to see criteria"}
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
                      <div className="h-full flex flex-col items-center justify-center p-12 text-center space-y-4">
                        <div className="h-20 w-20 rounded-3xl bg-muted/30 border border-dashed border-border flex items-center justify-center">
                          <Brain className="h-10 w-10 text-muted-foreground/20" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-bold text-foreground/70">No Question Selected</h4>
                          <p className="text-sm text-muted-foreground max-w-[200px] mx-auto">Click any question on the left to see its scoring rubric.</p>
                        </div>
                      </div>
                    )}
                  </ScrollArea>
                  
                  {selectedQuestion && (
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
          )}
        </main>
      </div>
    </DesktopOnlyGuard>
  );
}
