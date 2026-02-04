import { useState, useEffect } from "react";
import { format } from "date-fns";
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
import { RefiningJDProgress } from "@/components/refining-jd-progress";
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
import { ArrowLeft, FileText, Brain, Loader2, Sparkles, ChevronRight, ChevronLeft, X, Settings, User, Globe, Clock, Info, Edit, MapPin, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LocationCombobox, type LocationValue } from "@/components/location-combobox";
import { ProjectLayout } from "@/components/project-layout";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const MIN_JD_LENGTH = 200;
const MIN_SME_LENGTH = 50;

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
  const [triedToAdvance, setTriedToAdvance] = useState(false);

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
      // Support both camelCase and snake_case from API; pre-fill from saved project
      const screeningRaw = p.interviewDuration ?? p.interview_duration;
      const screeningNum = screeningRaw != null && screeningRaw !== "" ? Number(screeningRaw) : NaN;
      setInterviewDuration(!Number.isNaN(screeningNum) && screeningNum >= 0 ? screeningNum : "");
      const totalRaw = p.totalMinutes ?? p.total_minutes;
      const totalNum = totalRaw != null && totalRaw !== "" ? Number(totalRaw) : NaN;
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

  const refineJd = useMutation({
    mutationFn: async (text: string) => {
      const response = await fetch(`/api/projects/${id}/refine-jd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jdText: text }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to refine JD" }));
        throw new Error(errorData.error || "Failed to refine JD");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setJdText(data.refinedJd);
      if (data.suggestedTitle && (!title || title.toLowerCase().includes("new project") || title.toLowerCase() === "test")) {
        setTitle(data.suggestedTitle);
      }
      toast({ title: "JD Refined", description: "The job description and project title have been updated by AI." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to refine JD. Please try again.", variant: "destructive" });
    },
  });

  const isScreeningExceedsInterview =
    typeof totalMinutes === "number" &&
    typeof interviewDuration === "number" &&
    interviewDuration > totalMinutes;

  const isTotalInterviewTimeMissing = totalMinutes === "" || totalMinutes === undefined || (typeof totalMinutes === "number" && totalMinutes <= 0);

  const getTotalMinutesForApi = (): number | undefined => {
    if (typeof totalMinutes === "number" && totalMinutes > 0) return totalMinutes;
    if (totalMinutes !== "" && totalMinutes != null) {
      const n = Number(totalMinutes);
      if (!Number.isNaN(n) && n > 0) return n;
    }
    return undefined;
  };

  const saveCampaignFields = () =>
    updateProject.mutateAsync({
      title,
      jdText,
      smeNotesText: smeNotes,
      companyWebsite: companyWebsite || undefined,
      locationCity: location?.city || undefined,
      locationState: location?.state || undefined,
      locationCountry: location?.country || undefined,
      interviewDuration: interviewDuration || undefined,
      totalMinutes: getTotalMinutesForApi(),
    } as Partial<Project>);

  const handleNextToJobDescription = async () => {
    setTriedToAdvance(true);
    if (isTotalInterviewTimeMissing) {
      toast({
        title: "Total Interview Time required",
        description: "Please enter the total interview time (minutes) before continuing.",
        variant: "destructive",
      });
      return;
    }
    if (isScreeningExceedsInterview) {
      toast({
        title: "Invalid duration",
        description: "Only move forward if screening time is less than or equal to interview time.",
        variant: "destructive",
      });
      return;
    }
    try {
      await saveCampaignFields();
      setSetupStep(2);
    } catch {
      // Error toast already from mutation
    }
  };

  const handleSave = () => {
    if (isTotalInterviewTimeMissing) {
      toast({
        title: "Total Interview Time required",
        description: "Please enter the total interview time (minutes) before saving.",
        variant: "destructive",
      });
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

    const totalMins = getTotalMinutesForApi();
    updateProject.mutate({
      title,
      jdText,
      smeNotesText: smeNotes,
      companyWebsite: companyWebsite || undefined,
      locationCity: location?.city || undefined,
      locationState: location?.state || undefined,
      locationCountry: location?.country || undefined,
      interviewDuration: interviewDuration || undefined,
      ...(totalMins != null && { totalMinutes: totalMins }),
    } as any);
  };

  const handleGenerate = async () => {
    if (isTotalInterviewTimeMissing) {
      toast({
        title: "Total Interview Time required",
        description: "Please enter the total interview time (minutes) in Campaign Settings first.",
        variant: "destructive",
      });
      return;
    }
    if (!jdText.trim()) {
      toast({ title: "Job description required", description: "Please add a job description first.", variant: "destructive" });
      return;
    }

    if (jdText.trim().length < MIN_JD_LENGTH) {
      toast({
        title: "Job description too short",
        description: `Please provide at least ${MIN_JD_LENGTH} characters for the job description to ensure AI can generate quality questions.`,
        variant: "destructive"
      });
      setSetupStep(2);
      return;
    }

    if (smeNotes.trim().length > 0 && smeNotes.trim().length < MIN_SME_LENGTH) {
      toast({
        title: "SME notes too short",
        description: `Please provide at least ${MIN_SME_LENGTH} characters for your instructions, or leave them blank if you don't have specific requirements.`,
        variant: "destructive"
      });
      setSetupStep(3);
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
        ...(getTotalMinutesForApi() != null && { totalMinutes: getTotalMinutesForApi() }),
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
    <ProjectLayout
      project={project}
      isLoading={isLoading}
      currentStage={1}
      stageDescription="Stage 1: Enter JD and SME notes, then generate questions"
      onStageClick={(stage) => {
        if (stage === 2 && hasExistingQuestions) navigate(`/projects/${id}/questions`);
      }}
      clickableStages={hasExistingQuestions ? [2] : []}
      actions={
        <Button onClick={handleSave} disabled={updateProject.isPending || isTotalInterviewTimeMissing} variant="outline" className="rounded-xl border-border/60 hover:bg-background/60 shadow-sm" data-testid="button-save">
          {updateProject.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Settings className="w-4 h-4 mr-2 text-muted-foreground" />
          )}
          Save Changes
        </Button>
      }
      subNavigation={
        <div className="relative flex items-center w-full max-w-2xl bg-muted/30 backdrop-blur-xl p-1.5 rounded-[1.25rem] border border-border/40 shadow-xl shadow-black/5 ring-1 ring-white/10">
          {[
            { stepId: 1 as const, label: "Campaign", icon: Settings },
            { stepId: 2 as const, label: "JD Setup", icon: FileText },
            { stepId: 3 as const, label: "SME Notes", icon: Brain },
          ].map(({ stepId, label, icon: Icon }, i) => (
            <div key={stepId} className="flex-1 relative">
              <button
                type="button"
                onClick={() => setSetupStep(stepId)}
                className={`relative z-10 flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs font-black transition-all w-full justify-center uppercase tracking-widest whitespace-nowrap ${setupStep === stepId
                  ? "text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
              >
                <Icon className={`w-3.5 h-3.5 transition-transform ${setupStep === stepId ? "scale-110" : "opacity-60"}`} />
                <span className="hidden sm:inline whitespace-nowrap">{label}</span>
              </button>
              {setupStep === stepId && (
                <motion.div
                  layoutId="active-setup-step"
                  className="absolute inset-0 bg-primary rounded-xl shadow-lg shadow-primary/25 z-0"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </div>
          ))}
        </div>
      }
    >

      {/* Progress card while questions are being generated (after confirm) */}
      {generateQuestions.isPending && (
        <GeneratingQuestionsProgress />
      )}

      {refineJd.isPending && (
        <RefiningJDProgress />
      )}

      {!generateQuestions.isPending && !refineJd.isPending && setupStep === 1 && (
        <Card className="rounded-[2.5rem] border-border/40 shadow-2xl shadow-primary/5 overflow-hidden bg-card/40 backdrop-blur-xl ring-1 ring-white/5">
          <CardHeader className="p-10 pb-6 relative overflow-hidden">
            <div className="flex items-center gap-4 mb-3">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shadow-inner ring-1 ring-primary/20">
                <Settings className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-3xl font-black tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">Campaign Settings</CardTitle>
                <CardDescription className="text-sm font-bold uppercase tracking-[0.1em] text-primary/60 mt-0.5">
                  Core Project Metadata
                </CardDescription>
              </div>
            </div>
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
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="total-minutes"
                    type="number"
                    min={1}
                    required
                    value={totalMinutes === "" || totalMinutes === undefined ? "" : totalMinutes}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        setTotalMinutes("");
                        return;
                      }
                      const num = parseInt(val, 10);
                      setTotalMinutes(Number.isNaN(num) ? "" : num);
                    }}
                    placeholder="e.g. 45"
                    className={`h-14 text-lg font-semibold rounded-2xl border-border/60 bg-background/50 focus-visible:ring-primary/20 focus-visible:border-primary transition-all px-5 ${triedToAdvance && isTotalInterviewTimeMissing ? "border-destructive/70 ring-1 ring-destructive/20" : ""}`}
                  />
                  {triedToAdvance && isTotalInterviewTimeMissing && (
                    <p className="text-sm text-destructive font-medium flex items-center gap-1.5 ml-1" role="alert">
                      <Info className="w-3.5 h-3.5" />
                      Required. Enter total interview time in minutes.
                    </p>
                  )}
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
                    placeholder="e.g. 15"
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
              <Button
                onClick={handleNextToJobDescription}
                disabled={updateProject.isPending}
                className="rounded-xl px-8 font-bold shadow-lg shadow-primary/20 gap-2 h-12 w-full sm:w-auto"
                data-testid="button-next-job-description"
              >
                {updateProject.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    Next: Job Description
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!generateQuestions.isPending && !refineJd.isPending && setupStep === 2 && (
        <Card className="rounded-[2.5rem] border-border/40 shadow-xl shadow-primary/5 overflow-hidden bg-card/50 backdrop-blur-sm">
          <CardHeader className="p-10 pb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <CardTitle className="text-2xl font-black tracking-tight">Job Description</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refineJd.mutate(jdText)}
                disabled={refineJd.isPending || !jdText.trim()}
                className="rounded-xl border-primary/20 hover:bg-primary/5 text-primary font-bold gap-2"
              >
                {refineJd.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Refine with AI
              </Button>
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
                <Button
                  onClick={() => {
                    if (jdText.trim().length < MIN_JD_LENGTH) {
                      toast({
                        title: "Job description too short",
                        description: `Please provide at least ${MIN_JD_LENGTH} characters for a comprehensive job description.`,
                        variant: "destructive",
                      });
                      return;
                    }
                    setSetupStep(3);
                  }}
                  className="rounded-xl px-8 font-bold shadow-lg shadow-primary/20 gap-2 h-12"
                  disabled={!jdText.trim()}
                >
                  Next: SME Notes
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!generateQuestions.isPending && !refineJd.isPending && setupStep === 3 && (
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
                  onClick={() => navigate(`/projects/${id}/questions`)}
                  className="rounded-xl px-8 h-12 font-black text-base shadow-lg shadow-primary/20 gap-2.5 w-full sm:w-auto bg-primary hover:scale-[1.02] active:scale-[0.98] transition-all"
                  data-testid="button-next-step"
                >
                  Next Step
                  <ChevronRight className="w-4 h-4" />
                </Button>
              ) : hasExistingQuestions && hasEdits ? (
                <AlertDialog open={showGenerateConfirm} onOpenChange={setShowGenerateConfirm}>
                  <Button
                    onClick={() => setShowGenerateConfirm(true)}
                    disabled={generateQuestions.isPending || !jdText.trim()}
                    className="rounded-xl px-8 h-12 font-black text-base shadow-lg shadow-primary/20 gap-2.5 w-full sm:w-auto bg-primary hover:scale-[1.02] active:scale-[0.98] transition-all"
                    data-testid="button-regenerate-questions"
                  >
                    {generateQuestions.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating Rubric...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Regenerate
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                  <AlertDialogContent className="rounded-3xl border-border/40 bg-card/95 backdrop-blur-md">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-xl font-black">
                        Regenerate Questions?
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-base font-medium">
                        Criteria have changed (JD, SME notes, screening time, or interview time). Regenerating will replace your existing questions with new ones based on the updated inputs.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-3">
                      <AlertDialogCancel className="rounded-xl font-bold">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleGenerate}
                        className="rounded-xl font-bold bg-primary hover:bg-primary/90"
                      >
                        Confirm & Regenerate
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
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
    </ProjectLayout>
  );
}
