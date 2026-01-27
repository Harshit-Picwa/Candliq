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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Header } from "@/components/header";
import { DesktopOnlyGuard } from "@/components/desktop-only-guard";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, ScreeningQuestion, Competency } from "@shared/schema";
import { ArrowLeft, GripVertical, Plus, Trash2, CheckCircle, AlertCircle, Loader2, RefreshCw, MessageSquare, Edit, ShieldCheck, ArrowUp, ArrowDown, Sparkles } from "lucide-react";
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
  const [showRepromptDialog, setShowRepromptDialog] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");
  const [editedQuestionIds, setEditedQuestionIds] = useState<Set<string>>(new Set());
  const [approved, setApproved] = useState(false);
  const [invalidQuestionIds, setInvalidQuestionIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (project) {
      const loadedQuestions = project.screeningQuestionsJson || [];
      const loadedCompetencies = project.competencyRubricJson || [];
      setQuestions(loadedQuestions);
      setCompetencies(loadedCompetencies);
      
      // Validate all questions on load
      const invalid = new Set<string>();
      loadedQuestions.forEach(q => {
        if (!q.question.trim()) {
          invalid.add(q.id);
        }
      });
      setInvalidQuestionIds(invalid);
      
      // Reset edited questions on load (only track new edits)
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

  const repromptQuestions = useMutation({
    mutationFn: async (instructions: string) => {
      return apiRequest("POST", `/api/projects/${id}/regenerate-questions`, {
        customInstructions: instructions,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      setShowRepromptDialog(false);
      setCustomInstructions("");
      toast({ title: "Questions regenerated", description: "New questions have been generated with your custom instructions." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to regenerate questions.", variant: "destructive" });
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
  // Phase 1 requirement: 10-15 questions total
  const projectDuration = (project as any)?.interviewDuration || 30;
  const minQuestions = 10; // Phase 1 requirement
  const maxQuestions = 15; // Phase 1 requirement
  const isValidQuestionCount = questionCount >= minQuestions && questionCount <= maxQuestions;
  const questionCountColor = isValidQuestionCount 
    ? "text-green-600" 
    : questionCount < minQuestions 
    ? "text-amber-600" 
    : "text-red-600";

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
    if (!isValidQuestionCount) {
      toast({ 
        title: "Invalid question count", 
        description: `Please ensure you have ${minQuestions}-${maxQuestions} questions. Currently: ${questionCount}`, 
        variant: "destructive" 
      });
      return;
    }
    
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

  if (isLoading) {
    return (
      <DesktopOnlyGuard>
        <div className="min-h-screen bg-background">
          <Header />
          <main className="max-w-4xl mx-auto px-8 py-12">
            <Skeleton className="h-8 w-64 mb-8" />
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          </main>
        </div>
      </DesktopOnlyGuard>
    );
  }

  return (
    <DesktopOnlyGuard>
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-4xl mx-auto px-8 py-12">
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/projects/${id}`}>
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold">{project?.title}</h1>
              <div className="flex items-center gap-3">
                <p className="text-muted-foreground">Screening Questions</p>
                <Badge 
                  variant={isValidQuestionCount ? "default" : "destructive"} 
                  className={questionCountColor}
                >
                  {questionCount} / {minQuestions}-{maxQuestions} questions
                </Badge>
                {approved && (
                  <Badge variant="outline" className="gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Approved
                  </Badge>
                )}
              </div>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Dialog open={showRepromptDialog} onOpenChange={setShowRepromptDialog}>
                      <DialogTrigger asChild>
                        <Button 
                          variant="outline" 
                          className="gap-2" 
                          data-testid="button-reprompt"
                          disabled={!project?.jdText}
                        >
                          <MessageSquare className="w-4 h-4" />
                          Re-Prompt
                        </Button>
                      </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Re-Prompt Questions</DialogTitle>
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
                      Please add a job description in the Setup page before regenerating questions.
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
                          setShowRepromptDialog(false);
                          setCustomInstructions("");
                        }}
                        disabled={repromptQuestions.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => repromptQuestions.mutate(customInstructions.trim())}
                        disabled={repromptQuestions.isPending}
                      >
                        {repromptQuestions.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            Regenerating...
                          </>
                        ) : (
                          "Re-Prompt"
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
                    <p>Job description is required to regenerate questions</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            <Button
              onClick={handleApprove}
              disabled={approved || !isValidQuestionCount}
              variant={approved ? "outline" : "default"}
              className="gap-2"
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
                  Approve Questions
                </>
              )}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveQuestions.isPending || !hasChanges || invalidQuestionIds.size > 0}
              variant="outline"
              data-testid="button-save-questions"
            >
              {saveQuestions.isPending ? "Saving..." : "Save Changes"}
            </Button>
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

          {(!isValidQuestionCount && questionCount > 0) && (
            <Card className="mb-6 border-amber-500/50 bg-amber-500/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertCircle className="w-4 h-4" />
                  <p className="text-sm font-medium">
                    Question count is {questionCount}. Please ensure you have {minQuestions}-{maxQuestions} questions.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          {invalidQuestionIds.size > 0 && (
            <Card className="mb-6 border-destructive/50 bg-destructive/5">
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
            <Card className="p-12">
              <div className="text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No questions yet</h3>
                <p className="text-muted-foreground mb-6">
                  Add a job description and generate questions to get started
                </p>
                <Button asChild>
                  <Link href={`/projects/${id}`}>Go to Setup</Link>
                </Button>
              </div>
            </Card>
          ) : (
            <div className="space-y-6">
              {groupedQuestions.map(({ competency, questions: compQuestions }) => (
                <Card key={competency.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Badge variant="secondary">{compQuestions.length}</Badge>
                      {competency.name}
                    </CardTitle>
                    <CardDescription>{competency.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="multiple" className="space-y-2">
                      {compQuestions.map((question, idx) => (
                        <AccordionItem
                          key={question.id}
                          value={question.id}
                          className="border rounded-lg px-4"
                          data-testid={`question-item-${question.id}`}
                        >
                          <div className={`flex items-center gap-3 py-3 ${invalidQuestionIds.has(question.id) ? "bg-destructive/5 border-l-2 border-l-destructive" : ""}`}>
                            <div className="flex flex-col gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 p-0"
                                onClick={() => moveQuestion(question.id, "up")}
                                disabled={idx === 0 || approved}
                                data-testid={`button-move-up-${question.id}`}
                              >
                                <ArrowUp className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 p-0"
                                onClick={() => moveQuestion(question.id, "down")}
                                disabled={idx === compQuestions.length - 1 || approved}
                                data-testid={`button-move-down-${question.id}`}
                              >
                                <ArrowDown className="w-3 h-3" />
                              </Button>
                            </div>
                            <Checkbox
                              checked={question.isMandatory}
                              onCheckedChange={() => toggleMandatory(question.id)}
                              data-testid={`checkbox-mandatory-${question.id}`}
                              disabled={approved}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Input
                                  value={question.question}
                                  onChange={(e) => updateQuestion(question.id, { question: e.target.value })}
                                  className={`border-none p-0 h-auto text-sm focus-visible:ring-0 ${
                                    invalidQuestionIds.has(question.id) ? "text-destructive" : ""
                                  }`}
                                  data-testid={`input-question-${question.id}`}
                                  disabled={approved}
                                  placeholder="Enter question text..."
                                />
                                <div className="flex items-center gap-1">
                                  {!editedQuestionIds.has(question.id) && (
                                    <Badge variant="outline" className="gap-1 text-xs">
                                      <Sparkles className="w-3 h-3" />
                                      AI Generated
                                    </Badge>
                                  )}
                                  {editedQuestionIds.has(question.id) && (
                                    <Badge variant="secondary" className="gap-1 text-xs">
                                      <Edit className="w-3 h-3" />
                                      Edited
                                    </Badge>
                                  )}
                                  {invalidQuestionIds.has(question.id) && (
                                    <Badge variant="destructive" className="gap-1 text-xs">
                                      <AlertCircle className="w-3 h-3" />
                                      Invalid
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              {invalidQuestionIds.has(question.id) && (
                                <p className="text-xs text-destructive mt-1">Question text cannot be empty</p>
                              )}
                            </div>
                            <Badge variant={question.isMandatory ? "default" : "outline"} className="shrink-0">
                              {question.isMandatory ? "Mandatory" : "Optional"}
                            </Badge>
                            <AccordionTrigger className="py-0 hover:no-underline" />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="shrink-0"
                              onClick={() => deleteQuestion(question.id)}
                              disabled={approved}
                              data-testid={`button-delete-question-${question.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </div>
                          <AccordionContent className="pt-0 pb-4">
                            <div className="pl-10 space-y-4">
                              <div>
                                <h4 className="text-sm font-medium mb-2">Typical Reasoning</h4>
                                <p className="text-sm text-muted-foreground">{question.rubric.typicalReasoning}</p>
                              </div>
                              <div className="grid sm:grid-cols-2 gap-4">
                                <div>
                                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                    Strong Signals
                                  </h4>
                                  <ul className="text-sm text-muted-foreground space-y-1">
                                    {question.rubric.strongSignals.map((s, i) => (
                                      <li key={i}>• {s}</li>
                                    ))}
                                  </ul>
                                </div>
                                <div>
                                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 text-amber-500" />
                                    Weak Signals
                                  </h4>
                                  <ul className="text-sm text-muted-foreground space-y-1">
                                    {question.rubric.weakSignals.map((s, i) => (
                                      <li key={i}>• {s}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                              {question.rubric.notes && (
                                <div>
                                  <h4 className="text-sm font-medium mb-2">Notes</h4>
                                  <p className="text-sm text-muted-foreground">{question.rubric.notes}</p>
                                </div>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    </DesktopOnlyGuard>
  );
}
