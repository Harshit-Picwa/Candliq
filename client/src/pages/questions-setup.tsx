import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Header } from "@/components/header";
import { DesktopOnlyGuard } from "@/components/desktop-only-guard";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, ScreeningQuestion, Competency } from "@shared/schema";
import { ArrowLeft, GripVertical, Plus, Trash2, CheckCircle, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function QuestionsSetupPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["/api/projects", id],
  });

  const [questions, setQuestions] = useState<ScreeningQuestion[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (project) {
      setQuestions(project.screeningQuestionsJson || []);
      setCompetencies(project.competencyRubricJson || []);
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

  const updateQuestion = (qId: string, updates: Partial<ScreeningQuestion>) => {
    setQuestions(questions.map(q => q.id === qId ? { ...q, ...updates } : q));
    setHasChanges(true);
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
              <p className="text-muted-foreground">Screening Questions</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2" data-testid="button-regenerate">
                  <RefreshCw className="w-4 h-4" />
                  Regenerate
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Regenerate questions?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will replace all current questions with new ones generated from the JD and SME notes.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => regenerateQuestions.mutate()}>
                    {regenerateQuestions.isPending ? "Regenerating..." : "Regenerate"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              onClick={() => saveQuestions.mutate()}
              disabled={saveQuestions.isPending || !hasChanges}
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
                          <div className="flex items-center gap-3 py-3">
                            <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                            <Checkbox
                              checked={question.isMandatory}
                              onCheckedChange={() => toggleMandatory(question.id)}
                              data-testid={`checkbox-mandatory-${question.id}`}
                            />
                            <div className="flex-1 min-w-0">
                              <Input
                                value={question.question}
                                onChange={(e) => updateQuestion(question.id, { question: e.target.value })}
                                className="border-none p-0 h-auto text-sm focus-visible:ring-0"
                                data-testid={`input-question-${question.id}`}
                              />
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
