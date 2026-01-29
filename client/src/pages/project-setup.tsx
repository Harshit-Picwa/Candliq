import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Header } from "@/components/header";
import { DesktopOnlyGuard } from "@/components/desktop-only-guard";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project } from "@shared/schema";
import { ProjectWorkflow } from "@/components/project-workflow";
import { ArrowLeft, FileText, Brain, Loader2, Sparkles, ChevronRight, ChevronLeft, Upload, X, CheckCircle, Settings } from "lucide-react";

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
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [interviewDuration, setInterviewDuration] = useState<number>(30);
  const [introMinutes, setIntroMinutes] = useState<number>(2);
  const [closureMinutes, setClosureMinutes] = useState<number>(2);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [setupStep, setSetupStep] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    if (project) {
      setTitle(project.title);
      setJdText(project.jdText || "");
      setSmeNotes(project.smeNotesText || "");
      setCompanyWebsite((project as any).companyWebsite || "");
      setInterviewDuration((project as any).interviewDuration ?? 30);
      setIntroMinutes((project as any).introMinutes ?? 2);
      setClosureMinutes((project as any).closureMinutes ?? 2);
    }
  }, [project]);

  const updateProject = useMutation({
    mutationFn: async (data: Partial<Project>) => {
      const { introMinutes: _i, closureMinutes: _c, ...rest } = data as Record<string, unknown>;
      return apiRequest("PATCH", `/api/projects/${id}`, rest);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      toast({ title: "Saved", description: "Project updated successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save changes.", variant: "destructive" });
    },
  });

  const uploadPDF = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("pdf", file);

      setUploading(true);
      setUploadProgress(0);

      // Simulate progress (since we can't track actual upload progress easily)
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      try {
        const response = await fetch(`/api/projects/${id}/upload-jd`, {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        clearInterval(progressInterval);
        setUploadProgress(100);

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Upload failed");
        }

        const result = await response.json();
        return result;
      } finally {
        setTimeout(() => {
          setUploading(false);
          setUploadProgress(0);
        }, 500);
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      setJdText(data.jdText || "");
      toast({ title: "PDF uploaded", description: "Text extracted from PDF successfully." });
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error?.message || "Failed to upload PDF.",
        variant: "destructive"
      });
    },
  });

  const generateQuestions = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/projects/${id}/generate-questions`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        const error = new Error(errorData.error || errorData.details || response.statusText);
        (error as any).status = response.status;
        (error as any).data = errorData;
        throw error;
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      toast({ title: "Questions generated", description: "AI has created screening questions based on your JD." });
      navigate(`/projects/${id}/questions`);
    },
    onError: (error: any) => {
      const errorMessage = error?.data?.error || error?.message || "Failed to generate questions.";
      const errorDetails = error?.data?.details || "";
      toast({
        title: "Error",
        description: errorDetails ? `${errorMessage}: ${errorDetails}` : errorMessage,
        variant: "destructive"
      });
    },
  });

  const handleSave = () => {
    updateProject.mutate({
      title,
      jdText,
      smeNotesText: smeNotes,
      companyWebsite: companyWebsite || undefined,
      interviewDuration: interviewDuration || undefined,
    } as any);
  };

  const handleGenerate = async () => {
    if (!jdText.trim()) {
      toast({ title: "Job description required", description: "Please add a job description first.", variant: "destructive" });
      return;
    }

    try {
      // First, save the project with the JD
      await updateProject.mutateAsync({
        title,
        jdText,
        smeNotesText: smeNotes,
        companyWebsite: companyWebsite || undefined,
        interviewDuration: interviewDuration || undefined,
      } as any);

      // Wait a moment for the database to update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Then generate questions
      generateQuestions.mutate();
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error?.message || "Failed to save project before generating questions.",
        variant: "destructive"
      });
    }
  };

  const handleFileSelect = (file: File) => {
    if (file.type !== "application/pdf") {
      toast({ title: "Invalid file type", description: "Only PDF files are allowed.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "PDF must be less than 10MB.", variant: "destructive" });
      return;
    }
    setUploadedFileName(file.name);
    uploadPDF.mutate(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  if (isLoading) {
    return (
      <DesktopOnlyGuard>
        <div className="min-h-screen page-gradient">
          <Header />
          <main className="max-w-4xl mx-auto px-8 py-12">
            <Skeleton className="h-8 w-64 mb-8 rounded-lg" />
            <Skeleton className="h-[400px] w-full rounded-2xl" />
          </main>
        </div>
      </DesktopOnlyGuard>
    );
  }

  return (
    <DesktopOnlyGuard>
      <div className="min-h-screen page-gradient">
        <Header />
        <main className="max-w-4xl mx-auto px-8 py-12">
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>
            <h1 className="text-xl font-bold tracking-tight flex-1">Setup</h1>
            <Button onClick={handleSave} disabled={updateProject.isPending} variant="outline" data-testid="button-save">
              {updateProject.isPending ? "Saving..." : "Save"}
            </Button>
          </div>

          <ProjectWorkflow currentStep="setup" projectId={id!} />

          <div className="flex items-center mb-10">
            {[
              { step: 1 as const, label: "Campaign Settings", icon: Settings },
              { step: 2 as const, label: "Job Description", icon: FileText },
              { step: 3 as const, label: "Notes", icon: Brain },
            ].map(({ step, label, icon: Icon }, i) => (
              <div key={step} className="flex items-center flex-1 last:flex-initial">
                <button
                  type="button"
                  onClick={() => setSetupStep(step)}
                  className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium transition-all shrink-0 ${setupStep === step
                    ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20"
                    : "bg-card border border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  data-testid={step === 1 ? "step-campaign" : step === 2 ? "step-jd" : "step-notes"}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${setupStep === step ? "bg-primary-foreground/20" : "bg-muted"
                    }`}>
                    {step}
                  </span>
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
                {i < 2 && (
                  <div className={`flex-1 h-0.5 mx-2 rounded-full transition-colors ${setupStep > step ? "bg-primary/40" : "bg-border"
                    }`} />
                )}
              </div>
            ))}
          </div>

          {setupStep === 1 && (
            <Card className="rounded-2xl border-card-border/80 shadow-sm card-elevated overflow-hidden">
              <CardHeader>
                <CardTitle>Campaign Settings</CardTitle>
                <CardDescription>
                  Configure project name, interview timing, and company information.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="project-title">Project title</Label>
                  <Input
                    id="project-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Senior Frontend Engineer"
                    data-testid="input-project-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interview-duration">Questions duration in interview (minutes)</Label>
                  <select
                    id="interview-duration"
                    value={interviewDuration}
                    onChange={(e) => setInterviewDuration(parseInt(e.target.value))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value={10}>10 minutes</option>
                    <option value={15}>15 minutes</option>
                    <option value={20}>20 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Time dedicated to skill-set questions only. Question count scales with duration.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="intro-minutes">Introduction time (minutes)</Label>
                    <select
                      id="intro-minutes"
                      value={introMinutes}
                      onChange={(e) => setIntroMinutes(parseInt(e.target.value))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value={0}>0</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={5}>5</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="closure-minutes">Conversation closure time (minutes)</Label>
                    <select
                      id="closure-minutes"
                      value={closureMinutes}
                      onChange={(e) => setClosureMinutes(parseInt(e.target.value))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value={0}>0</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={5}>5</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-website">Company website (optional)</Label>
                  <Input
                    id="company-website"
                    type="url"
                    value={companyWebsite}
                    onChange={(e) => setCompanyWebsite(e.target.value)}
                    placeholder="https://example.com"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    AI will use this to align questions with company culture.
                  </p>
                </div>
                <div className="flex justify-end pt-4">
                  <Button onClick={() => setSetupStep(2)} className="gap-2 shadow-sm" data-testid="button-next-step-1">
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {setupStep === 2 && (
            <Card className="rounded-2xl border-card-border/80 shadow-sm card-elevated overflow-hidden">
              <CardHeader>
                <CardTitle>Job Description</CardTitle>
                <CardDescription>
                  Paste the job description. It will be used to extract competencies and generate screening questions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  placeholder="Paste the full job description here..."
                  className="min-h-[300px] font-mono text-sm"
                  data-testid="textarea-jd"
                />
                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setSetupStep(1)} className="gap-2" data-testid="button-back-step-2">
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </Button>
                  <Button onClick={() => setSetupStep(3)} className="gap-2 shadow-sm" data-testid="button-next-step-2">
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {setupStep === 3 && (
            <Card className="rounded-2xl border-card-border/80 shadow-sm card-elevated overflow-hidden">
              <CardHeader>
                <CardTitle>Notes</CardTitle>
                <CardDescription>
                  Add subject matter expert notes: ideal candidate profile, red flags, or skills to probe.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={smeNotes}
                  onChange={(e) => setSmeNotes(e.target.value)}
                  placeholder="E.g., 'Must have experience with distributed systems. Watch for red flags around collaboration...'"
                  className="min-h-[240px]"
                  data-testid="textarea-sme"
                />
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6">
                  <Button variant="outline" onClick={() => setSetupStep(2)} className="gap-2 w-full sm:w-auto" data-testid="button-back-step-3">
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </Button>
                  <div className="flex items-center gap-4 w-full sm:w-auto justify-end">
                    <div className="hidden sm:block text-sm text-muted-foreground">
                      AI will extract competencies and create questions with rubrics.
                    </div>
                    <Button
                      onClick={handleGenerate}
                      disabled={generateQuestions.isPending || !jdText.trim()}
                      className="gap-2 w-full sm:w-auto shadow-md hover:shadow-lg transition-all bg-primary hover:bg-primary/90"
                      data-testid="button-generate-questions"
                    >
                      {generateQuestions.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Generate Questions
                          <ChevronRight className="w-4 h-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </DesktopOnlyGuard>
  );
}
