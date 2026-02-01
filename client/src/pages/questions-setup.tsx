import { useState, useEffect } from "react";
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
import { ArrowLeft, Trash2, CheckCircle, AlertCircle, Loader2, MessageSquare, Edit, ShieldCheck, ArrowUp, ArrowDown, Sparkles, ChevronRight, ChevronLeft, User, Settings, Brain } from "lucide-react";
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
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [isRefiningIndividual, setIsRefiningIndividual] = useState(false);

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
    mutationFn: async ({ instructions, questionId }: { instructions: string, questionId?: string }) => {
      if (questionId) {
        return apiRequest("POST", `/api/projects/${id}/refine-question`, {
          questionId,
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
      toast({ 
        title: variables.questionId ? "Question refined" : "Questions refined", 
        description: variables.questionId 
          ? "The question has been refined based on your instructions." 
          : "New questions have been generated with your custom instructions." 
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
    toast({ title: "Questions approved", description: "Questions have been finalized." });
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
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/projects/${id}`}>
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold tracking-tight">{project?.title}</h1>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-muted-foreground text-sm">Questions</p>
                <Badge variant="secondary" className="font-medium">
                  {questionCount} question{questionCount !== 1 ? "s" : ""}
                </Badge>
                {approved && (
                  <Badge variant="outline" className="gap-1 ring-1 ring-primary/20">
                    <ShieldCheck className="w-3 h-3" />
                    Approved
                  </Badge>
                )}
              </div>
            </div>
            {step === "edit" && (
              <>
                <Button
                  onClick={handleContinueToReview}
                  disabled={questionCount === 0 || invalidQuestionIds.size > 0}
                  className="gap-2 shadow-sm"
                  data-testid="button-review-approve"
                >
                  Next: Review & Approve
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saveQuestions.isPending || !hasChanges || invalidQuestionIds.size > 0}
                  variant="outline"
                  data-testid="button-save-questions"
                >
                  {saveQuestions.isPending ? "Saving..." : "Save"}
                </Button>
              </>
            )}
            {step === "review" && (
              <>
                <Button
                  onClick={handleApprove}
                  disabled={approved || questionCount === 0 || invalidQuestionIds.size > 0}
                  variant={approved ? "default" : "default"}
                  className="gap-2 shadow-md hover:shadow-lg transition-shadow"
                  data-testid="button-approve-questions"
                >
                  {approved ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Approved
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Approve Questions
                    </>
                  )}
                </Button>
              </>
            )}
          </div>

          <div className="flex gap-2 mb-8 bg-muted/30 p-1 rounded-xl w-fit mx-auto border border-border/50">
            <Link href={`/projects/${id}`}>
              <Button variant="ghost" size="sm" className="rounded-lg px-6 text-muted-foreground">
                <Settings className="w-4 h-4 mr-2" />
                1. Setup
              </Button>
            </Link>
            <Link href={`/projects/${id}/questions`}>
              <Button variant="secondary" size="sm" className="rounded-lg px-6">
                <Brain className="w-4 h-4 mr-2" />
                2. Questions
              </Button>
            </Link>
            <Link href={`/projects/${id}/interviews`}>
              <Button variant="ghost" size="sm" className="rounded-lg px-6 text-muted-foreground">
                <User className="w-4 h-4 mr-2" />
                3. Interviews
              </Button>
            </Link>
          </div>

          <div className="flex items-center mb-10">
            {[
              { stepId: "edit" as const, label: "Refine Screening", icon: Edit },
              { stepId: "review" as const, label: "Review & Approve", icon: ShieldCheck },
            ].map(({ stepId, label, icon: Icon }, i) => (
              <div key={stepId} className="flex items-center flex-1 last:flex-initial">
                <button
                  type="button"
                  onClick={() => {
                    if (stepId === "review" && !validateAllQuestions()) return;
                    setStep(stepId);
                  }}
                  className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium transition-all shrink-0 ${
                    step === stepId
                      ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20"
                      : "bg-card border border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${
                    step === stepId ? "bg-primary-foreground/20" : "bg-muted"
                  }`}>
                    {i + 1}
                  </span>
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
                {i < 1 && (
                  <div className={`flex-1 h-0.5 mx-4 rounded-full transition-colors ${
                    step === "review" ? "bg-primary/40" : "bg-border"
                  }`} />
                )}
              </div>
            ))}
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
            <Card className="rounded-2xl border-card-border/80 card-elevated p-16">
              <div className="text-center max-w-md mx-auto">
                <div className="mx-auto w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mb-6 ring-2 ring-border/50">
                  <AlertCircle className="w-10 h-10 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No questions yet</h3>
                <p className="text-muted-foreground mb-8 leading-relaxed">
                  Add a job description and generate questions to get started.
                </p>
                <Button asChild className="shadow-sm">
                  <Link href={`/projects/${id}`}>Go to Setup</Link>
                </Button>
              </div>
            </Card>
          ) : step === "review" ? (
            <div className="space-y-6">
              {groupedQuestions.map(({ competency, questions: compQuestions }) => {
                const selectedCompQuestions = compQuestions.filter(q => q.isMandatory);
                if (selectedCompQuestions.length === 0) return null;

                return (
                  <Card key={competency.id} className="rounded-2xl border-card-border/80 overflow-hidden">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Badge variant="secondary">{selectedCompQuestions.length}</Badge>
                        {competency.name}
                      </CardTitle>
                      <CardDescription>{competency.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {selectedCompQuestions.map((q) => (
                        <div key={q.id} className="rounded-xl border border-border/80 bg-muted/20 p-5 space-y-4">
                          <p className="font-medium text-sm leading-snug">{q.question}</p>
                          <div className="pl-0 space-y-3">
                            <h4 className="text-sm font-semibold">Expected answers</h4>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Typical reasoning</p>
                              <p className="text-sm">{q.rubric.typicalReasoning || "—"}</p>
                            </div>
                            <div className="grid sm:grid-cols-3 gap-3">
                              <div>
                                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3 text-green-500" /> Good
                                </p>
                                <ul className="text-sm space-y-0.5">
                                  {q.rubric.goodSignals?.map((s, i) => (
                                    <li key={i}>• {s}</li>
                                  ))}
                                  {(!q.rubric.goodSignals || q.rubric.goodSignals.length === 0) && (
                                    <li className="text-muted-foreground">—</li>
                                  )}
                                </ul>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                                  <MessageSquare className="w-3 h-3 text-blue-500" /> Moderate
                                </p>
                                <ul className="text-sm space-y-0.5">
                                  {q.rubric.moderateSignals?.map((s, i) => (
                                    <li key={i}>• {s}</li>
                                  ))}
                                  {(!q.rubric.moderateSignals || q.rubric.moderateSignals.length === 0) && (
                                    <li className="text-muted-foreground">—</li>
                                  )}
                                </ul>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3 text-amber-500" /> Poor
                                </p>
                                <ul className="text-sm space-y-0.5">
                                  {q.rubric.poorSignals?.map((s, i) => (
                                    <li key={i}>• {s}</li>
                                  ))}
                                  {(!q.rubric.poorSignals || q.rubric.poorSignals.length === 0) && (
                                    <li className="text-muted-foreground">—</li>
                                  )}
                                </ul>
                              </div>
                            </div>
                            {q.rubric.notes && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Notes</p>
                                <p className="text-sm">{q.rubric.notes}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <ScrollArea className="h-[calc(100vh-280px)] pr-4 -mr-4 scrollbar-sm">
                <div className="space-y-6 pb-8">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <h2 className="text-lg font-semibold">Refine Screening Criteria</h2>
                    <Dialog open={showRefineDialog} onOpenChange={(open) => {
                      setShowRefineDialog(open);
                      if (!open) setIsRefiningIndividual(false);
                    }}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          disabled={!project?.jdText || refineQuestions.isPending}
                          onClick={() => setIsRefiningIndividual(false)}
                        >
                          <Sparkles className="w-4 h-4" />
                          Refine All
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{isRefiningIndividual ? "Refine question" : "Refine all questions"}</DialogTitle>
                          <DialogDescription>
                            {isRefiningIndividual 
                              ? "Provide custom instructions to refine this specific question." 
                              : "Provide custom instructions to refine how all questions are generated. This will replace current questions."}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          {isRefiningIndividual && selectedQuestion && (
                            <div className="p-3 bg-muted rounded-lg text-xs font-medium border border-border/50 italic mb-2">
                              "{selectedQuestion.question}"
                            </div>
                          )}
                          <Textarea
                            value={customInstructions}
                            onChange={(e) => setCustomInstructions(e.target.value)}
                            placeholder={isRefiningIndividual ? "How should this question change?" : "E.g., 'Make questions more technical'..."}
                            className="min-h-[120px]"
                          />
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => {
                            setShowRefineDialog(false);
                            setIsRefiningIndividual(false);
                          }}>Cancel</Button>
                          <Button 
                            onClick={() => refineQuestions.mutate({ 
                              instructions: customInstructions, 
                              questionId: isRefiningIndividual ? selectedQuestionId || undefined : undefined 
                            })}
                            disabled={refineQuestions.isPending}
                          >
                            {refineQuestions.isPending ? "Refining..." : isRefiningIndividual ? "Refine Question" : "Refine All"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  {groupedQuestions
                    .filter(g => g.questions && g.questions.length > 0)
                    .map(({ competency, questions: compQuestions }, activeIdx) => {
                      // Calculate global offset for numbering across filtered groups
                      const previousQuestionsCount = groupedQuestions
                        .filter(g => g.questions && g.questions.length > 0)
                        .slice(0, activeIdx)
                        .reduce((acc, g) => acc + g.questions.length, 0);

                      return (
                        <div key={competency.id} className="space-y-3">
                          <div className="flex items-center gap-2 px-1">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                              {activeIdx + 1}
                            </div>
                            <span className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground/60">{competency.name}</span>
                          </div>
                          <div className="space-y-3">
                            {compQuestions.map((question, idx) => (
                              <div
                                key={question.id}
                                data-testid={`question-item-${question.id}`}
                                onClick={() => setSelectedQuestionId(question.id)}
                                className={`rounded-xl border p-4 cursor-pointer transition-all ${
                                  selectedQuestionId === question.id
                                    ? "ring-2 ring-primary border-primary shadow-md bg-primary/5"
                                    : "hover:bg-muted/30 bg-card shadow-sm border-border/40"
                                } ${invalidQuestionIds.has(question.id) ? "border-destructive bg-destructive/5" : ""}`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="flex flex-col gap-0.5 shrink-0 mt-0.5">
                                    <span className="text-[10px] font-bold text-muted-foreground/30 mb-1 w-6 text-center">
                                      {previousQuestionsCount + idx + 1}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 p-0 hover:bg-primary/10 hover:text-primary disabled:opacity-20"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        moveQuestion(question.id, "up");
                                      }}
                                      disabled={activeIdx === 0 && idx === 0}
                                    >
                                      <ArrowUp className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 p-0 hover:bg-primary/10 hover:text-primary disabled:opacity-20"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        moveQuestion(question.id, "down");
                                      }}
                                      disabled={activeIdx === (groupedQuestions.filter(g => g.questions.length > 0).length - 1) && idx === (compQuestions.length - 1)}
                                    >
                                      <ArrowDown className="w-3 h-3" />
                                    </Button>
                                  </div>
                                  <div className="flex-1 min-w-0 space-y-3">
                                    <div className="flex items-start justify-between gap-2">
                                      <Textarea
                                        value={question.question}
                                        onChange={(e) => updateQuestion(question.id, { question: e.target.value })}
                                        onClick={(e) => e.stopPropagation()}
                                        className={`min-h-[80px] w-full resize-none text-sm font-medium border-none p-0 focus-visible:ring-0 bg-transparent leading-relaxed ${
                                          invalidQuestionIds.has(question.id) ? "text-destructive" : ""
                                        }`}
                                        placeholder="Enter question text..."
                                      />
                                      <div className="flex items-center gap-1 shrink-0">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedQuestionId(question.id);
                                            setIsRefiningIndividual(true);
                                            setShowRefineDialog(true);
                                          }}
                                        >
                                          <Sparkles className="w-4 h-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            deleteQuestion(question.id);
                                          }}
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div 
                                        className="flex items-center gap-2 cursor-pointer group"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleMandatory(question.id);
                                        }}
                                      >
                                        <Checkbox
                                          checked={question.isMandatory}
                                          onCheckedChange={() => toggleMandatory(question.id)}
                                          className="h-4 w-4"
                                        />
                                        <span className={`text-xs font-semibold ${question.isMandatory ? "text-primary" : "text-muted-foreground"}`}>
                                          {question.isMandatory ? "Included in interview" : "Not included"}
                                        </span>
                                      </div>
                                      {!editedQuestionIds.has(question.id) && (
                                        <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 gap-1 h-5 text-[10px]">
                                          <Sparkles className="w-3 h-3" /> AI Generated
                                        </Badge>
                                      )}
                                      {editedQuestionIds.has(question.id) && (
                                        <Badge variant="outline" className="gap-1 h-5 text-[10px]">
                                          <Edit className="w-3 h-3" /> Edited
                                        </Badge>
                                      )}
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

              <div className="lg:sticky lg:top-4">
                <Card className="rounded-2xl border-card-border/80 shadow-md overflow-hidden bg-card">
                  <CardHeader className="bg-muted/30 border-b border-border/40 py-4">
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Expected answers</CardTitle>
                    <CardDescription className="text-xs">
                      {selectedQuestion
                        ? "Rubric for the selected question"
                        : "Select a question to view expected answers"}
                    </CardDescription>
                  </CardHeader>
                  <ScrollArea className="h-[calc(100vh-380px)] scrollbar-sm">
                    {selectedQuestion ? (
                      <CardContent className="space-y-6 pt-6 pb-8">
                        <div className="space-y-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Typical reasoning</h4>
                          <p className="text-sm leading-relaxed">
                            {selectedQuestion.rubric.typicalReasoning || "—"}
                          </p>
                        </div>
                        
                        <div className="space-y-5">
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-green-600/80 flex items-center gap-2">
                              <CheckCircle className="w-3.5 h-3.5" /> Good
                            </h4>
                            <ul className="text-sm space-y-1.5 pl-1">
                              {selectedQuestion.rubric.goodSignals?.map((s, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-green-500/50" />
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600/80 flex items-center gap-2">
                              <MessageSquare className="w-3.5 h-3.5" /> Moderate
                            </h4>
                            <ul className="text-sm space-y-1.5 pl-1">
                              {selectedQuestion.rubric.moderateSignals?.map((s, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-blue-500/50" />
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600/80 flex items-center gap-2">
                              <AlertCircle className="w-3.5 h-3.5" /> Poor
                            </h4>
                            <ul className="text-sm space-y-1.5 pl-1">
                              {selectedQuestion.rubric.poorSignals?.map((s, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500/50" />
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        {selectedQuestion.rubric.notes && (
                          <div className="pt-4 border-t border-border/40">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 mb-2">Refine Screening</h4>
                            <p className="text-sm italic text-muted-foreground leading-relaxed">
                              {selectedQuestion.rubric.notes}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    ) : (
                      <CardContent className="p-12 text-center">
                        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-4">
                          <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
                        </div>
                        <p className="text-sm text-muted-foreground">Select a question on the left to view the detailed rubric and evaluation criteria.</p>
                      </CardContent>
                    )}
                  </ScrollArea>
                </Card>
              </div>
            </div>
          )}
        </main>
      </div>
    </DesktopOnlyGuard>
  );
}
