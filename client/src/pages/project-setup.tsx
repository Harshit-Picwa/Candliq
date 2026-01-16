import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Header } from "@/components/header";
import { DesktopOnlyGuard } from "@/components/desktop-only-guard";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project } from "@shared/schema";
import { ArrowLeft, FileText, Brain, Loader2, Sparkles, Users, ChevronRight } from "lucide-react";

export default function ProjectSetupPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["/api/projects", id],
  });

  const [title, setTitle] = useState("");
  const [jdText, setJdText] = useState("");
  const [smeNotes, setSmeNotes] = useState("");

  useEffect(() => {
    if (project) {
      setTitle(project.title);
      setJdText(project.jdText || "");
      setSmeNotes(project.smeNotesText || "");
    }
  }, [project]);

  const updateProject = useMutation({
    mutationFn: async (data: Partial<Project>) => {
      return apiRequest("PATCH", `/api/projects/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      toast({ title: "Saved", description: "Project updated successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save changes.", variant: "destructive" });
    },
  });

  const generateQuestions = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/projects/${id}/generate-questions`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      toast({ title: "Questions generated", description: "AI has created screening questions based on your JD." });
      navigate(`/projects/${id}/questions`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate questions.", variant: "destructive" });
    },
  });

  const handleSave = () => {
    updateProject.mutate({ title, jdText, smeNotesText: smeNotes });
  };

  const handleGenerate = () => {
    if (!jdText.trim()) {
      toast({ title: "Job description required", description: "Please add a job description first.", variant: "destructive" });
      return;
    }
    handleSave();
    generateQuestions.mutate();
  };

  if (isLoading) {
    return (
      <DesktopOnlyGuard>
        <div className="min-h-screen bg-background">
          <Header />
          <main className="max-w-4xl mx-auto px-8 py-12">
            <Skeleton className="h-8 w-64 mb-8" />
            <Skeleton className="h-[400px] w-full" />
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
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>
            <div className="flex-1">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-2xl font-semibold border-none px-0 focus-visible:ring-0"
                placeholder="Project title"
                data-testid="input-project-title"
              />
            </div>
            <Button onClick={handleSave} disabled={updateProject.isPending} variant="outline" data-testid="button-save">
              {updateProject.isPending ? "Saving..." : "Save"}
            </Button>
          </div>

          <div className="flex gap-2 mb-8">
            <Link href={`/projects/${id}`}>
              <Button variant="secondary" size="sm">Setup</Button>
            </Link>
            <Link href={`/projects/${id}/questions`}>
              <Button variant="ghost" size="sm">Questions</Button>
            </Link>
            <Link href={`/projects/${id}/interviews`}>
              <Button variant="ghost" size="sm">Interviews</Button>
            </Link>
          </div>

          <Tabs defaultValue="jd" className="space-y-6">
            <TabsList>
              <TabsTrigger value="jd" className="gap-2" data-testid="tab-jd">
                <FileText className="w-4 h-4" />
                Job Description
              </TabsTrigger>
              <TabsTrigger value="sme" className="gap-2" data-testid="tab-sme">
                <Brain className="w-4 h-4" />
                SME Notes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="jd">
              <Card>
                <CardHeader>
                  <CardTitle>Job Description</CardTitle>
                  <CardDescription>
                    Paste or type the job description. This will be used to extract competencies and generate screening questions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                    placeholder="Paste the full job description here..."
                    className="min-h-[300px] font-mono text-sm"
                    data-testid="textarea-jd"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sme">
              <Card>
                <CardHeader>
                  <CardTitle>SME Notes</CardTitle>
                  <CardDescription>
                    Add any subject matter expert notes: ideal candidate profile, red flags to watch for, specific skills to probe, etc.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={smeNotes}
                    onChange={(e) => setSmeNotes(e.target.value)}
                    placeholder="E.g., 'Must have experience with distributed systems. Look for red flags around collaboration...'"
                    className="min-h-[300px]"
                    data-testid="textarea-sme"
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 p-6 rounded-lg bg-card border">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-medium">Generate Screening Questions</h3>
                <p className="text-sm text-muted-foreground">
                  AI will extract competencies and create questions with rubrics
                </p>
              </div>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={generateQuestions.isPending || !jdText.trim()}
              className="gap-2"
              data-testid="button-generate-questions"
            >
              {generateQuestions.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  Generate Questions
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </main>
      </div>
    </DesktopOnlyGuard>
  );
}
