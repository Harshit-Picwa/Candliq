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
import { GeneratingQuestionsProgress } from "@/components/generating-questions-progress";
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
import { StageProgressBar } from "@/components/stage-progress-bar";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project } from "@shared/schema";
import { ArrowLeft, FileText, Brain, Loader2, Sparkles, ChevronRight, ChevronLeft, X, Settings, User, Globe, Clock, Info, Edit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LocationCombobox, type LocationValue } from "@/components/location-combobox";

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
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [interviewDuration, setInterviewDuration] = useState<number | "">("");
  const [totalMinutes, setTotalMinutes] = useState<number | "">("");
  const [setupStep, setSetupStep] = useState<1 | 2 | 3>(1);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);

  const hasExistingQuestions = (project?.screeningQuestionsJson?.length || 0) > 0;
  const projectRecord = project as Record<string, unknown> | undefined;
  const normalizedProjectInterviewMinutes = (() => {
    const raw = projectRecord?.interviewDuration ?? projectRecord?.interview_duration;
    const num = raw != null && raw !== "" ? Number(raw) : NaN;
    return !Number.isNaN(num) && num > 0 ? num : "";
  })();
  const normalizedProjectTotalMinutes = (() => {
    const raw = projectRecord?.totalMinutes ?? projectRecord?.total_minutes;
    const num = raw != null && raw !== "" ? Number(raw) : NaN;
    return !Number.isNaN(num) && num >= 0 ? num : "";
  })();
  const projectCity = (projectRecord?.locationCity as string) || "";
  const projectState = (projectRecord?.locationState as string) || "";
  const projectCountry = (projectRecord?.locationCountry as string) || "";
  const locationChanged =
    (location?.city ?? "") !== projectCity ||
    (location?.state ?? "") !== projectState ||
    (location?.country ?? "") !== projectCountry;
  const hasEdits =
    jdText !== (project?.jdText || "") ||
    smeNotes !== (project?.smeNotesText || "") ||
    companyWebsite !== ((projectRecord?.companyWebsite as string) || "") ||
    locationChanged ||
    interviewDuration !== normalizedProjectInterviewMinutes ||
    totalMinutes !== normalizedProjectTotalMinutes;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stepParam = params.get("step");
    if (stepParam === "2") setSetupStep(2);
    if (stepParam === "3") setSetupStep(3);
  }, []);

  useEffect(() => {
    if (project) {
      const p = project as Record<string, unknown>;
      setTitle(project.title);
      setJdText(project.jdText || "");
      setSmeNotes(project.smeNotesText || "");
      setCompanyWebsite((p.companyWebsite as string) || "");
      const locCity = (p.locationCity as string) || (p.location_city as string) || "";
      const locState = (p.locationState as string) || (p.location_state as string) || "";
      const locCountry = (p.locationCountry as string) || (p.location_country as string) || "";
      setLocation(
        locCity || locState || locCountry
          ? { city: locCity, state: locState, country: locCountry }
          : null
      );
      // Support both camelCase and snake_case from API; no default — leave empty for new projects
      const screeningMins = p.interviewDuration ?? p.interview_duration;
      const screeningNum = screeningMins != null && screeningMins !== "" ? Number(screeningMins) : NaN;
      setInterviewDuration(!Number.isNaN(screeningNum) && screeningNum > 0 ? screeningNum : "");
      const totalMins = p.totalMinutes ?? p.total_minutes;
      const totalNum = totalMins != null && totalMins !== "" ? Number(totalMins) : NaN;
      setTotalMinutes(!Number.isNaN(totalNum) && totalNum >= 0 ? totalNum : "");
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

  const isScreeningExceedsInterview =
    typeof totalMinutes === "number" &&
    typeof interviewDuration === "number" &&
    interviewDuration > totalMinutes;

  const handleNextToJobDescription = () => {
    if (isScreeningExceedsInterview) {
      toast({
        title: "Invalid duration",
        description: "Only move forward if screening time is less than or equal to interview time.",
        variant: "destructive",
      });
      return;
    }
    setSetupStep(2);
  };

  const handleSave = () => {
    if (isScreeningExceedsInterview) {
      toast({
        title: "Invalid Duration",
        description: "Only move forward if screening time is less than or equal to interview time.",
        variant: "destructive",
      });
      return;
    }

    updateProject.mutate({
      title,
      jdText,
      smeNotesText: smeNotes,
      companyWebsite: companyWebsite || undefined,
      locationCity: location?.city || undefined,
      locationState: location?.state || undefined,
      locationCountry: location?.country || undefined,
      interviewDuration: interviewDuration || undefined,
      totalMinutes: totalMinutes || undefined,
    } as any);
  };

  const handleGenerate = async () => {
    if (!jdText.trim()) {
      toast({ title: "Job description required", description: "Please add a job description first.", variant: "destructive" });
      return;
    }

    if (isScreeningExceedsInterview) {
      toast({
        title: "Invalid Duration",
        description: "Only move forward if screening time is less than or equal to interview time.",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateProject.mutateAsync({
        title,
        jdText,
        smeNotesText: smeNotes,
        companyWebsite: companyWebsite || undefined,
        locationCity: location?.city || undefined,
        locationState: location?.state || undefined,
        locationCountry: location?.country || undefined,
        interviewDuration: interviewDuration || undefined,
        totalMinutes: totalMinutes || undefined,
      } as any);

      await new Promise(resolve => setTimeout(resolve, 100));
      generateQuestions.mutate();
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error?.message || "Failed to save project before generating questions.",
        variant: "destructive"
      });
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
        <main className="max-w-5xl mx-auto px-8 py-12">
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" size="icon" asChild className="rounded-full hover:bg-background/80">
              <Link href="/dashboard">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-bold py-0 h-5 px-2 rounded-md bg-background/50 border-primary/20 text-primary/80">
                  Project Setup
                </Badge>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground/90">{title || "New Project"}</h1>
            </div>
            <Button onClick={handleSave} disabled={updateProject.isPending} variant="outline" className="rounded-xl border-border/60 hover:bg-background/60 shadow-sm" data-testid="button-save">
              {updateProject.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Settings className="w-4 h-4 mr-2 text-muted-foreground" />
              )}
              Save Changes
            </Button>
          </div>

          {/* Three-stage progress: Stage 1 = JD & SME Notes → Create questions; Stage 2 = Refine & Review (clickable when questions exist) */}
          <div className="mb-6 max-w-4xl mx-auto">
            <StageProgressBar
              currentStage={1}
              onStageClick={(stage) => {
                if (stage === 2 && hasExistingQuestions) navigate(`/projects/${id}/questions`);
              }}
              clickableStages={hasExistingQuestions ? [2] : []}
              disabledStageTooltips={hasExistingQuestions ? undefined : { 2: "Generate Questions first" }}
            />
          </div>

          <div className="flex items-center justify-center mb-4">
            <p className="text-xs font-medium text-muted-foreground">Stage 1: Enter JD and SME notes, then generate questions</p>
          </div>

          <div className="flex items-center justify-center mb-12">
            <div className="flex items-center w-full max-w-3xl bg-card/40 backdrop-blur-sm p-2 rounded-2xl border border-border/40 shadow-sm">
              {[
                { step: 1 as const, label: "Campaign", icon: Settings },
                { step: 2 as const, label: "Job Description", icon: FileText },
                { step: 3 as const, label: "SME Notes", icon: Brain },
              ].map(({ step, label, icon: Icon }, i) => (
                <div key={step} className="flex items-center flex-1 last:flex-initial">
                  <button
                    type="button"
                    onClick={() => setSetupStep(step)}
                    className={`flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-bold transition-all w-full justify-center ${setupStep === step
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 ring-1 ring-primary/20"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      }`}
                  >
                    <div className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black ${setupStep === step ? "bg-primary-foreground/20 text-white" : "bg-muted text-muted-foreground"
                      }`}>
                      {step}
                    </div>
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                  {i < 2 && (
                    <div className="mx-2 text-muted-foreground/30">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Progress card while questions are being generated (after confirm) */}
          {generateQuestions.isPending && (
            <GeneratingQuestionsProgress />
          )}

          {!generateQuestions.isPending && setupStep === 1 && (
            <Card className="rounded-[2.5rem] border-border/40 shadow-xl shadow-primary/5 overflow-hidden bg-card/50 backdrop-blur-sm">
              <CardHeader className="p-10 pb-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Settings className="w-5 h-5 text-primary" />
                  </div>
                  <CardTitle className="text-2xl font-black tracking-tight">Campaign Settings</CardTitle>
                </div>
                <CardDescription className="text-base font-medium ml-13">
                  Configure the foundational details for your hiring project.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-10 pt-0 space-y-8">
                <div className="grid gap-8">
                  <div className="space-y-3">
                    <Label htmlFor="project-title" className="text-xs font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Project Title</Label>
                    <Input
                      id="project-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Senior Frontend Engineer"
                      className="h-14 text-lg font-semibold rounded-2xl border-border/60 bg-background/50 focus-visible:ring-primary/20 focus-visible:border-primary transition-all px-5"
                      data-testid="input-project-title"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <Label htmlFor="total-minutes" className="text-xs font-black uppercase tracking-widest text-muted-foreground/70 ml-1 flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        Total Interview Time (min)
                      </Label>
                      <Input
                        id="total-minutes"
                        type="number"
                        value={totalMinutes}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "") {
                            setTotalMinutes("");
                            return;
                          }
                          setTotalMinutes(parseInt(val) || 0);
                        }}
                        placeholder="Minutes"
                        className="h-14 text-lg font-semibold rounded-2xl border-border/60 bg-background/50 focus-visible:ring-primary/20 focus-visible:border-primary transition-all px-5"
                      />
                    </div>

                    <div className="space-y-3">
                      <Label htmlFor="interview-duration" className="text-xs font-black uppercase tracking-widest text-muted-foreground/70 ml-1 flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        Total Screening Time (min)
                      </Label>
                      <Input
                        id="interview-duration"
                        type="number"
                        value={interviewDuration}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "") {
                            setInterviewDuration("");
                            return;
                          }
                          setInterviewDuration(parseInt(val) || 0);
                        }}
                        placeholder="Minutes"
                        className={`h-14 text-lg font-semibold rounded-2xl border-border/60 bg-background/50 focus-visible:ring-primary/20 focus-visible:border-primary transition-all px-5 ${isScreeningExceedsInterview ? "border-destructive ring-1 ring-destructive/30" : ""}`}
                      />
                      {isScreeningExceedsInterview && (
                        <p className="text-sm text-destructive font-medium flex items-center gap-1.5 ml-1" role="alert">
                          <Info className="w-3.5 h-3.5" />
                          Only move forward if screening time is less than or equal to interview time.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="company-website" className="text-xs font-black uppercase tracking-widest text-muted-foreground/70 ml-1 flex items-center gap-2">
                      <Globe className="w-3 h-3" />
                      Company Website
                    </Label>
                    <Input
                      id="company-website"
                      type="url"
                      value={companyWebsite}
                      onChange={(e) => setCompanyWebsite(e.target.value)}
                      placeholder="https://company.com"
                      className="h-14 text-base font-medium rounded-2xl border-border/60 bg-background/50 focus-visible:ring-primary/20 focus-visible:border-primary transition-all px-5"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="location" className="text-xs font-black uppercase tracking-widest text-muted-foreground/70 ml-1">
                      Location
                    </Label>
                    <LocationCombobox
                      id="location"
                      value={location}
                      onChange={setLocation}
                      placeholder="City, State, Country (Australia & NZ)"
                      data-testid="input-location"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-end items-center gap-3 pt-6">
                  <Button onClick={handleNextToJobDescription} className="rounded-xl px-8 font-bold shadow-lg shadow-primary/20 gap-2 h-12 w-full sm:w-auto" data-testid="button-next-job-description">
                    Next: Job Description
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!generateQuestions.isPending && setupStep === 2 && (
            <Card className="rounded-[2.5rem] border-border/40 shadow-xl shadow-primary/5 overflow-hidden bg-card/50 backdrop-blur-sm">
              <CardHeader className="p-10 pb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle className="text-2xl font-black tracking-tight">Job Description</CardTitle>
                  </div>
                </div>
                <CardDescription className="text-base font-medium ml-13 mt-2">
                  Paste the job description (text only). Our AI will generate screening questions and grading rubrics.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-10 pt-0 space-y-6">
                <div className="relative group">
                  <Textarea
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                    placeholder="Paste the full job description here..."
                    className="min-h-[400px] text-base font-medium rounded-[2rem] border-border/60 bg-background/50 focus-visible:ring-primary/20 focus-visible:border-primary transition-all p-8 resize-none leading-relaxed"
                    data-testid="textarea-jd"
                  />
                  {jdText.length === 0 && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-40 group-hover:opacity-60 transition-opacity">
                      <div className="text-center space-y-4">
                        <div className="h-16 w-16 rounded-[1.5rem] bg-muted mx-auto flex items-center justify-center">
                          <FileText className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Empty Job Description</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6">
                  <Button variant="ghost" onClick={() => setSetupStep(1)} className="rounded-xl font-bold h-12 px-6 gap-2 w-full sm:w-auto order-2 sm:order-1" data-testid="button-back-step-2">
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </Button>
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto order-1 sm:order-2">
                    <Button onClick={() => setSetupStep(3)} className="rounded-xl px-8 font-bold shadow-lg shadow-primary/20 gap-2 h-12" disabled={!jdText.trim()}>
                      Next: SME Notes
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {!generateQuestions.isPending && setupStep === 3 && (
            <Card className="rounded-[2.5rem] border-border/40 shadow-xl shadow-primary/5 overflow-hidden bg-card/50 backdrop-blur-sm">
              <CardHeader className="p-10 pb-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Brain className="w-5 h-5 text-primary" />
                  </div>
                  <CardTitle className="text-2xl font-black tracking-tight">SME Notes</CardTitle>
                </div>
                <CardDescription className="text-base font-medium ml-13">
                  Add SME expectations (e.g. Head of Tech, Head of Marketing) so the AI generates questions and rubrics that match.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-10 pt-0 space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1 text-primary">
                    <Info className="w-4 h-4" />
                    <span className="text-xs font-black uppercase tracking-widest">SME Guidance (Optional)</span>
                  </div>
                  <Textarea
                    value={smeNotes}
                    onChange={(e) => setSmeNotes(e.target.value)}
                    placeholder="E.g., 'Focus heavily on architectural decisions' or 'Ask about experience with high-traffic systems'..."
                    className="min-h-[300px] text-base font-medium rounded-[2rem] border-border/60 bg-background/50 focus-visible:ring-primary/20 focus-visible:border-primary transition-all p-8 resize-none leading-relaxed"
                    data-testid="textarea-sme"
                  />
                </div>

                <div className="p-6 rounded-[2rem] bg-primary/[0.03] border border-primary/10 flex items-center gap-6">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Sparkles className="w-7 h-7 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-black text-foreground/80 uppercase tracking-widest leading-none mb-1.5">AI Ready</h4>
                    <p className="text-sm text-muted-foreground font-medium">Click below to extract competencies and generate tailored rubrics.</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-6">
                  <Button variant="ghost" onClick={() => setSetupStep(2)} className="rounded-xl font-bold h-12 px-6 gap-2 w-full sm:w-auto" data-testid="button-back-step-3">
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </Button>

                  {hasExistingQuestions && !hasEdits ? (
                    <Button
                      onClick={() => setSetupStep(2)}
                      className="rounded-xl px-8 h-12 font-black text-base shadow-lg shadow-primary/20 gap-2.5 w-full sm:w-auto bg-primary hover:scale-[1.02] active:scale-[0.98] transition-all"
                      data-testid="button-edit-jd-sme"
                    >
                      <Edit className="w-4 h-4" />
                      Edit JD & SME Notes
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  ) : (
                    <AlertDialog open={showGenerateConfirm} onOpenChange={setShowGenerateConfirm}>
                      <Button
                        onClick={() => setShowGenerateConfirm(true)}
                        disabled={generateQuestions.isPending || !jdText.trim()}
                        className="rounded-xl px-8 h-12 font-black text-base shadow-lg shadow-primary/20 gap-2.5 w-full sm:w-auto bg-primary hover:scale-[1.02] active:scale-[0.98] transition-all"
                        data-testid="button-generate-questions"
                      >
                        {generateQuestions.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Generating Rubric...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            {hasExistingQuestions ? "Regenerate Questions" : "Generate Questions"}
                            <ChevronRight className="w-4 h-4" />
                          </>
                        )}
                      </Button>
                      <AlertDialogContent className="rounded-3xl border-border/40 bg-card/95 backdrop-blur-md">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-xl font-black">
                            {hasExistingQuestions ? "Regenerate Questions?" : "Generate Questions?"}
                          </AlertDialogTitle>
                          <AlertDialogDescription className="text-base font-medium">
                            Candiq AI will analyze your JD and SME notes and generate screening questions with grading rubrics (Good vs Bad answers).
                            {hasExistingQuestions && " This will replace your existing questions."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="gap-3">
                          <AlertDialogCancel className="rounded-xl font-bold">Review Details</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleGenerate}
                            className="rounded-xl font-bold bg-primary hover:bg-primary/90"
                          >
                            Confirm & {hasExistingQuestions ? "Regenerate" : "Generate"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </DesktopOnlyGuard>
  );
}
