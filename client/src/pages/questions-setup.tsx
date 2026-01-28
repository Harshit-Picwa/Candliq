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
import { ArrowLeft, Trash2, CheckCircle, AlertCircle, Loader2, MessageSquare, Edit, ShieldCheck, ArrowUp, ArrowDown, Sparkles, ChevronRight, ChevronLeft } from "lucide-react";
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
    mutationFn: async (instructions: string) => {
      return apiRequest("POST", `/api/projects/${id}/regenerate-questions`, {
        customInstructions: instructions,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      setShowRefineDialog(false);
      setCustomInstructions("");
      toast({ title: "Questions refined", description: "New questions have been generated with your custom instructions." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to refine questions.", variant: "destructive" });
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
              <h1 className="text-2xl font-bold tracking-tight">{project?.title}</h1>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-muted-foreground text-sm">Screening Questions</p>
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
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Dialog open={showRefineDialog} onOpenChange={setShowRefineDialog}>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              className="gap-2"
                              data-testid="button-refine-questions"
                              disabled={!project?.jdText}
                            >
                              <MessageSquare className="w-4 h-4" />
                              Refine questions
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Refine questions</DialogTitle>
                              <DialogDescription>
                                Provide custom instructions to refine how questions are generated. This will replace all current questions.
                              </DialogDescription>
                            </DialogHeader>
                            {!project?.jdText ? (
                              <div className="py-4">
                                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
                                  <AlertCircle className="w-4 h-4" />
                                  <p className="text-sm font-medium">Job description required</p>
                                </div>
                                <p className="text-sm text-muted-foreground mt-2">
                                  Please add a job description in the Setup page before refining questions.
                                </p>
                              </div>
                            ) : (
                              <>
                                <div className="space-y-4 py-4">
                                  <div>
                                    <label htmlFor="custom-instructions" className="text-sm font-medium mb-2 block">
                                      Custom Instructions
                                    </label>
                                    <Textarea
                                      id="custom-instructions"
                                      value={customInstructions}
                                      onChange={(e) => setCustomInstructions(e.target.value)}
                                      placeholder="E.g., 'Make questions more technical', 'Focus on culture fit', 'Add questions about system design', 'Make questions harder'"
                                      className="min-h-[120px]"
                                      maxLength={500}
                                    />
                                    <p className="text-xs text-muted-foreground mt-2">
                                      {customInstructions.length}/500 characters
                                    </p>
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    <p className="font-medium mb-1">Examples:</p>
                                    <ul className="list-disc list-inside space-y-1 ml-2">
                                      <li>Make questions more technical and specific</li>
                                      <li>Focus on culture fit and collaboration</li>
                                      <li>Add questions about system design</li>
                                      <li>Make questions harder/easier</li>
                                    </ul>
                                  </div>
                                </div>
                                <DialogFooter>
                                  <Button
                                    variant="outline"
                                    onClick={() => {
                                      setShowRefineDialog(false);
                                      setCustomInstructions("");
                                    }}
                                    disabled={refineQuestions.isPending}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    onClick={() => refineQuestions.mutate(customInstructions.trim())}
                                    disabled={refineQuestions.isPending}
                                  >
                                    {refineQuestions.isPending ? (
                                      <>
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        Refining...
                                      </>
                                    ) : (
                                      "Refine questions"
                                    )}
                                  </Button>
                                </DialogFooter>
                              </>
                            )}
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TooltipTrigger>
                    {!project?.jdText && (
                      <TooltipContent>
                        <p>Job description is required to refine questions</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
                <Button
                  onClick={handleContinueToReview}
                  disabled={questionCount === 0 || invalidQuestionIds.size > 0}
                  variant="outline"
                  className="gap-2 shadow-sm"
                  data-testid="button-review-approve"
                >
                  Review & Approve
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saveQuestions.isPending || !hasChanges || invalidQuestionIds.size > 0}
                  variant="outline"
                  data-testid="button-save-questions"
                >
                  {saveQuestions.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </>
            )}
            {step === "review" && (
              <>
                <Button
                  onClick={() => setStep("edit")}
                  variant="outline"
                  className="gap-2"
                  data-testid="button-back-to-edit"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back to edit
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={approved || questionCount === 0 || invalidQuestionIds.size > 0}
                  variant={approved ? "outline" : "default"}
                  className="gap-2 shadow-md hover:shadow-lg transition-shadow"
                  data-testid="button-approve-questions"
                >
                  {approved ? (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Approved
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Approve
                    </>
                  )}
                </Button>
              </>
            )}
          </div>

          <div className="flex gap-2 mb-8">
            <Link href={`/projects/${id}`}>
              <Button variant="ghost" size="sm">Setup</Button>
            </Link>
            <Link href={`/projects/${id}/questions`}>
              <Button variant="secondary" size="sm">Questions</Button>
            </Link>
            <Link href={`/projects/${id}/interviews`}>
              <Button variant="ghost" size="sm">Interviews</Button>
            </Link>
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
              {groupedQuestions.map(({ competency, questions: compQuestions }) => (
                <Card key={competency.id} className="rounded-2xl border-card-border/80 overflow-hidden">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Badge variant="secondary">{compQuestions.length}</Badge>
                      {competency.name}
                    </CardTitle>
                    <CardDescription>{competency.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {compQuestions.map((q) => (
                      <div key={q.id} className="rounded-xl border border-border/80 bg-muted/20 p-5 space-y-4">
                        <p className="font-medium text-sm leading-snug">{q.question}</p>
                        <div className="pl-0 space-y-3">
                          <h4 className="text-sm font-semibold">Expected answers</h4>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Typical reasoning</p>
                            <p className="text-sm">{q.rubric.typicalReasoning || "—"}</p>
                          </div>
                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3 text-green-500" /> Strong signals
                              </p>
                              <ul className="text-sm space-y-0.5">
                                {q.rubric.strongSignals?.map((s, i) => (
                                  <li key={i}>• {s}</li>
                                ))}
                                {(!q.rubric.strongSignals || q.rubric.strongSignals.length === 0) && (
                                  <li className="text-muted-foreground">—</li>
                                )}
                              </ul>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 text-amber-500" /> Weak signals
                              </p>
                              <ul className="text-sm space-y-0.5">
                                {q.rubric.weakSignals?.map((s, i) => (
                                  <li key={i}>• {s}</li>
                                ))}
                                {(!q.rubric.weakSignals || q.rubric.weakSignals.length === 0) && (
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
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[480px]">
              <ScrollArea className="h-[520px] pr-4">
                <div className="space-y-6">
                  {groupedQuestions.map(({ competency, questions: compQuestions }) => (
                    <div key={competency.id}>
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="secondary" className="font-medium">{compQuestions.length}</Badge>
                        <span className="font-semibold text-sm">{competency.name}</span>
                      </div>
                      <div className="space-y-2">
                        {compQuestions.map((question, idx) => (
                          <div
                            key={question.id}
                            data-testid={`question-item-${question.id}`}
                            onClick={() => setSelectedQuestionId(question.id)}
                            className={`rounded-xl border p-3 cursor-pointer transition-all ${
                              selectedQuestionId === question.id
                                ? "ring-2 ring-primary border-primary shadow-md bg-primary/5"
                                : "hover:bg-muted/50 hover:border-muted-foreground/20"
                            } ${invalidQuestionIds.has(question.id) ? "border-destructive bg-destructive/5" : "border-border/80"}`}
                          >
                            <div className="flex items-start gap-2">
                              <div className="flex flex-col gap-0.5 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveQuestion(question.id, "up");
                                  }}
                                  disabled={idx === 0}
                                  data-testid={`button-move-up-${question.id}`}
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveQuestion(question.id, "down");
                                  }}
                                  disabled={idx === compQuestions.length - 1}
                                  data-testid={`button-move-down-${question.id}`}
                                >
                                  <ArrowDown className="w-3 h-3" />
                                </Button>
                              </div>
                              <Checkbox
                                checked={question.isMandatory}
                                onCheckedChange={() => toggleMandatory(question.id)}
                                onClick={(e) => e.stopPropagation()}
                                data-testid={`checkbox-included-${question.id}`}
                                aria-label={question.isMandatory ? "Included" : "Not included"}
                              />
                              <div className="flex-1 min-w-0 space-y-1">
                                <Textarea
                                  value={question.question}
                                  onChange={(e) => updateQuestion(question.id, { question: e.target.value })}
                                  onClick={(e) => e.stopPropagation()}
                                  className={`min-h-[60px] resize-none text-sm border-none p-0 focus-visible:ring-0 bg-transparent ${
                                    invalidQuestionIds.has(question.id) ? "text-destructive" : ""
                                  }`}
                                  data-testid={`input-question-${question.id}`}
                                  placeholder="Enter question text..."
                                />
                                <div className="flex items-center gap-1 flex-wrap">
                                  {!editedQuestionIds.has(question.id) && (
                                    <Badge variant="outline" className="gap-1 text-xs">
                                      <Sparkles className="w-3 h-3" />
                                      AI
                                    </Badge>
                                  )}
                                  {editedQuestionIds.has(question.id) && (
                                    <Badge variant="secondary" className="gap-1 text-xs">
                                      <Edit className="w-3 h-3" />
                                      Edited
                                    </Badge>
                                  )}
                                  <Badge variant={question.isMandatory ? "default" : "outline"} className="text-xs">
                                    {question.isMandatory ? "Included" : "Not included"}
                                  </Badge>
                                </div>
                                {invalidQuestionIds.has(question.id) && (
                                  <p className="text-xs text-destructive">Question text cannot be empty</p>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0 h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteQuestion(question.id);
                                }}
                                data-testid={`button-delete-question-${question.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <Card className="lg:sticky lg:top-4 h-fit rounded-2xl border-card-border/80 shadow-sm overflow-hidden">
                <CardHeader className="bg-muted/30 border-b border-border/50">
                  <CardTitle className="text-base font-semibold">Expected answers</CardTitle>
                  <CardDescription>
                    {selectedQuestion
                      ? "Rubric for the selected question"
                      : "Select a question to view expected answers"}
                  </CardDescription>
                </CardHeader>
                {selectedQuestion && (
                  <CardContent className="space-y-4 pt-5">
                    <div>
                      <h4 className="text-sm font-medium mb-2">Typical reasoning</h4>
                      <p className="text-sm text-muted-foreground">
                        {selectedQuestion.rubric.typicalReasoning || "—"}
                      </p>
                    </div>
                    <div className="grid sm:grid-cols-1 gap-4">
                      <div>
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          Strong signals
                        </h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {selectedQuestion.rubric.strongSignals?.map((s, i) => (
                            <li key={i}>• {s}</li>
                          ))}
                          {(!selectedQuestion.rubric.strongSignals || selectedQuestion.rubric.strongSignals.length === 0) && (
                            <li>—</li>
                          )}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-500" />
                          Weak signals
                        </h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {selectedQuestion.rubric.weakSignals?.map((s, i) => (
                            <li key={i}>• {s}</li>
                          ))}
                          {(!selectedQuestion.rubric.weakSignals || selectedQuestion.rubric.weakSignals.length === 0) && (
                            <li>—</li>
                          )}
                        </ul>
                      </div>
                    </div>
                    {selectedQuestion.rubric.notes && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Notes</h4>
                        <p className="text-sm text-muted-foreground">{selectedQuestion.rubric.notes}</p>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            </div>
          )}
        </main>
      </div>
    </DesktopOnlyGuard>
  );
}
