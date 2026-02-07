import { useState, useEffect, useRef, useMemo } from "react";
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
import { ArrowLeft, FileText, Brain, Loader2, Sparkles, ChevronRight, ChevronLeft, X, Settings, User, Globe, Clock, Info, Edit, MapPin, Calendar, Eye, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LocationCombobox, type LocationValue } from "@/components/location-combobox";
import { JobTitleInput } from "@/components/job-title-input";
import { ProjectLayout } from "@/components/project-layout";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const MIN_JD_LENGTH = 200;
const MIN_SME_LENGTH = 50;

export default function ProjectSetupPage() {
  const { id } = useParams<{ id: string }>();
  const [currentPath, navigate] = useLocation();
  const { toast } = useToast();
  
  // Check if we're in preview/review mode - re-check when URL changes
  const isPreviewMode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("preview") === "true";
  }, [currentPath]);

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
  const initialStepSet = useRef(false);
  const stageSaved = useRef(false);
  const urlStepRef = useRef<1 | 2 | 3 | null>(null);
  
  // Snapshot of field values at the time questions were last generated.
  // Used to detect if regeneration is needed (survives intermediate saves).
  const generationBaselineRef = useRef<{
    jdText: string;
    smeNotes: string;
    companyWebsite: string;
    interviewDuration: number | "";
    totalMinutes: number | "";
    locationCity: string;
    locationState: string;
    locationCountry: string;
    title: string;
  } | null>(null);

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

  // Compare against baseline (values at last question generation) — survives intermediate saves
  const baseline = generationBaselineRef.current;
  const hasEditsSinceGeneration = baseline ? (
    jdText !== baseline.jdText ||
    smeNotes !== baseline.smeNotes ||
    companyWebsite !== baseline.companyWebsite ||
    interviewDuration !== baseline.interviewDuration ||
    totalMinutes !== baseline.totalMinutes ||
    title !== baseline.title ||
    (location?.city ?? "") !== baseline.locationCity ||
    (location?.state ?? "") !== baseline.locationState ||
    (location?.country ?? "") !== baseline.locationCountry
  ) : hasEdits;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stepParam = params.get("step");
    // Capture desired step from URL; actual navigation is validated after we load project data
    if (stepParam === "2") urlStepRef.current = 2;
    if (stepParam === "3") urlStepRef.current = 3;
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
      
      // Capture baseline values on first load (represents state at last generation)
      if (!generationBaselineRef.current) {
        generationBaselineRef.current = {
          jdText: project.jdText || "",
          smeNotes: project.smeNotesText || "",
          companyWebsite: (p.companyWebsite as string) || "",
          interviewDuration: !Number.isNaN(screeningNum) && screeningNum >= 0 ? screeningNum : "",
          totalMinutes: !Number.isNaN(totalNum) && totalNum >= 0 ? totalNum : "",
          locationCity: locCity,
          locationState: locState,
          locationCountry: locCountry,
          title: project.title,
        };
      }

      // Restore saved setup step on initial load
      if (!initialStepSet.current) {
        const savedStep = p.setupStep as number | undefined;

        const desiredStepFromUrl = urlStepRef.current;
        const desiredStepFromProject =
          savedStep === 1 || savedStep === 2 || savedStep === 3 ? savedStep : 1;
        const desiredStep = desiredStepFromUrl ?? desiredStepFromProject;

        // Validate campaign completeness from PROJECT (not local state, which isn't initialized yet)
        const projectTotalMinutesRaw = p.totalMinutes ?? p.total_minutes;
        const projectTotalMinutesNum =
          projectTotalMinutesRaw != null && projectTotalMinutesRaw !== ""
            ? Number(projectTotalMinutesRaw)
            : NaN;
        const projectTotalInterviewTimeMissing = Number.isNaN(projectTotalMinutesNum) || projectTotalMinutesNum <= 0;
        const projectTitleMissing = !(project.title || "").trim();
        const projectInterviewDurationRaw = p.interviewDuration ?? p.interview_duration;
        const projectInterviewDurationNum =
          projectInterviewDurationRaw != null && projectInterviewDurationRaw !== ""
            ? Number(projectInterviewDurationRaw)
            : NaN;
        const projectScreeningTimeMissing = Number.isNaN(projectInterviewDurationNum) || projectInterviewDurationNum <= 0;
        const projectCompanyWebsiteMissing = !((p.companyWebsite as string) || "").trim();
        const projectLocCity = (p.locationCity as string) || (p.location_city as string) || "";
        const projectLocState = (p.locationState as string) || (p.location_state as string) || "";
        const projectLocCountry = (p.locationCountry as string) || (p.location_country as string) || "";
        const projectLocationMissing = !(projectLocCity.trim() || projectLocState.trim() || projectLocCountry.trim());

        const campaignIncompleteFromProject =
          projectTitleMissing ||
          projectTotalInterviewTimeMissing ||
          projectScreeningTimeMissing ||
          projectCompanyWebsiteMissing ||
          projectLocationMissing;

        // If Campaign Settings are incomplete, always force user to step 1
        setSetupStep(campaignIncompleteFromProject && desiredStep !== 1 ? 1 : desiredStep);

        // URL step only applies once
        urlStepRef.current = null;
        initialStepSet.current = true;
      }
    }
  }, [project]);

  // Persist current stage when visiting this page (even if user doesn't change steps)
  useEffect(() => {
    if (project && !stageSaved.current) {
      apiRequest("PATCH", `/api/projects/${id}`, { currentStage: 1 });
      stageSaved.current = true;
    }
  }, [project, id]);
  
  // Save setup step to server
  const saveSetupStep = useMutation({
    mutationFn: async (step: 1 | 2 | 3) => {
      return apiRequest("PATCH", `/api/projects/${id}`, { setupStep: step, currentStage: 1 });
    },
  });
  
  // Helper to change step and persist
  const changeSetupStep = (step: 1 | 2 | 3) => {
    // Prevent leaving Campaign Settings until required fields are complete
    if (setupStep === 1 && step !== 1 && isCampaignSettingsIncomplete) {
      setTriedToAdvance(true);
      toast({
        title: "Complete required fields",
        description:
          "Please complete all fields: Role Title, Total Interview Time, Screening Q&A Time, Company Website, and Location.",
        variant: "destructive",
      });
      return;
    }
    setSetupStep(step);
    saveSetupStep.mutate(step);
  };

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
  const isTitleMissing = !title.trim();
  const isScreeningTimeMissing = interviewDuration === "" || interviewDuration === undefined || (typeof interviewDuration === "number" && interviewDuration <= 0);
  const isCompanyWebsiteMissing = !companyWebsite.trim();
  const isLocationMissing = !location || (!(location?.city?.trim()) && !(location?.state?.trim()) && !(location?.country?.trim()));
  const isCampaignSettingsIncomplete =
    isTitleMissing ||
    isTotalInterviewTimeMissing ||
    isScreeningTimeMissing ||
    isCompanyWebsiteMissing ||
    isLocationMissing;

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
    if (isCampaignSettingsIncomplete) {
      toast({
        title: "Complete required fields",
        description: "Please complete all fields: Role Title, Total Interview Time, Screening Q&A Time, Company Website, and Location.",
        variant: "destructive",
      });
      return;
    }
    if (isScreeningExceedsInterview) {
      toast({
        title: "Invalid duration",
        description: "Screening Q&A time must be less than or equal to total interview time.",
        variant: "destructive",
      });
      return;
    }
    try {
      await saveCampaignFields();
      changeSetupStep(2);
    } catch {
      // Error toast already from mutation
    }
  };

  const handleSave = () => {
    if (isCampaignSettingsIncomplete) {
      toast({
        title: "Complete required fields",
        description: "Please complete all fields in Interview Setup before saving.",
        variant: "destructive",
      });
      return;
    }
    if (isScreeningExceedsInterview) {
      toast({
        title: "Invalid Duration",
        description: "Screening Q&A time must be less than or equal to total interview time.",
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
        description: "Please enter the total interview time (minutes) in Interview Setup first.",
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
      changeSetupStep(2);
      return;
    }

    if (smeNotes.trim().length > 0 && smeNotes.trim().length < MIN_SME_LENGTH) {
      toast({
        title: "Expert guidance too short",
        description: `Please provide at least ${MIN_SME_LENGTH} characters for your instructions, or leave them blank if you don't have specific requirements.`,
        variant: "destructive"
      });
      changeSetupStep(3);
      return;
    }

    if (isScreeningExceedsInterview) {
      toast({
        title: "Invalid Duration",
        description: "Screening Q&A time must be less than or equal to total interview time.",
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

  // Exit preview mode and go back to dashboard
  const exitPreviewMode = () => {
    navigate("/dashboard");
  };

  return (
    <ProjectLayout
      project={project}
      isLoading={isLoading}
      currentStage={1}
      stageDescription={isPreviewMode ? "Preview Mode - Review project details" : "Tell us about the role and we'll generate expert-level screening questions for you"}
      onStageClick={(stage) => {
        if (stage === 2 && hasExistingQuestions) navigate(`/projects/${id}/questions${isPreviewMode ? '?preview=true' : ''}`);
      }}
      clickableStages={hasExistingQuestions ? [2] : []}
      actions={
        isPreviewMode ? (
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              onClick={exitPreviewMode}
              className="rounded-xl border-border/60 hover:bg-background/60 shadow-sm"
            >
              <X className="w-4 h-4 mr-2" />
              Exit Preview
            </Button>
            <Button 
              onClick={() => navigate(`/projects/${id}`)}
              className="rounded-xl shadow-sm"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit Project
            </Button>
          </div>
        ) : (
          <Button onClick={handleSave} disabled={updateProject.isPending || isTotalInterviewTimeMissing} variant="outline" className="rounded-xl border-border/60 hover:bg-background/60 shadow-sm" data-testid="button-save">
            {updateProject.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Settings className="w-4 h-4 mr-2 text-muted-foreground" />
            )}
            Save Changes
          </Button>
        )
      }
      subNavigation={
        <div className="relative flex items-center w-full max-w-2xl bg-muted/30 backdrop-blur-xl p-1.5 rounded-[1.25rem] border border-border/40 shadow-xl shadow-black/5 ring-1 ring-white/10">
          {[
            { stepId: 1 as const, label: "Interview Setup", icon: Settings },
            { stepId: 2 as const, label: "Job Description", icon: FileText },
            { stepId: 3 as const, label: "Subject Matter Expert Notes", icon: Brain },
          ].map(({ stepId, label, icon: Icon }, i) => (
            <div key={stepId} className="flex-1 relative">
              <button
                type="button"
                onClick={() => changeSetupStep(stepId)}
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
      {/* Preview Mode Banner */}
      {isPreviewMode && (
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/20">
              <Eye className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-foreground">Preview Mode</h3>
              <p className="text-xs text-muted-foreground">Viewing project details in read-only mode</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Step {setupStep} of 3</span>
            <span className="text-blue-500">•</span>
            <span>Use Accept to continue</span>
          </div>
        </div>
      )}

      {/* Progress card while questions are being generated (after confirm) */}
      {generateQuestions.isPending && (
        <GeneratingQuestionsProgress />
      )}

      {refineJd.isPending && (
        <RefiningJDProgress />
      )}

      {!generateQuestions.isPending && !refineJd.isPending && setupStep === 1 && (
        <Card className="rounded-[2.5rem] border-border/40 shadow-2xl shadow-primary/5 bg-card/40 backdrop-blur-xl ring-1 ring-white/5">
          <CardHeader className="p-10 pb-6 relative">
            <div className="flex items-center gap-4 mb-3">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shadow-inner ring-1 ring-primary/20">
                <Settings className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-3xl font-black tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">Interview Setup</CardTitle>
                <CardDescription className="text-sm font-bold uppercase tracking-[0.1em] text-primary/60 mt-0.5">
                  Step 1 of 3
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-10 pt-0 space-y-8">
            <div className="grid gap-8">
              <div className="space-y-3 relative" style={{ zIndex: 101 }}>
                <Label htmlFor="project-title" className="text-xs font-black uppercase tracking-widest text-muted-foreground/70 ml-1 flex items-center gap-2">
                  Role Title
                  <span className="text-destructive">*</span>
                </Label>
                <JobTitleInput
                  id="project-title"
                  value={title}
                  onChange={setTitle}
                  placeholder="e.g. Senior Frontend Engineer"
                  className={cn("h-14 text-lg font-semibold rounded-2xl border-border/60 bg-background/50 focus-visible:ring-primary/20 focus-visible:border-primary transition-all px-5", triedToAdvance && isTitleMissing && "border-destructive/70 ring-1 ring-destructive/20")}
                  data-testid="input-project-title"
                  disabled={isPreviewMode}
                />
                {triedToAdvance && isTitleMissing && (
                  <p className="text-sm text-destructive font-medium flex items-center gap-1.5 ml-1" role="alert">
                    <Info className="w-3.5 h-3.5" />
                    Required.
                  </p>
                )}
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
                    disabled={isPreviewMode}
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
                    className={cn("h-14 text-lg font-semibold rounded-2xl border-border/60 bg-background/50 focus-visible:ring-primary/20 focus-visible:border-primary transition-all px-5", triedToAdvance && isTotalInterviewTimeMissing && "border-destructive/70 ring-1 ring-destructive/20", isPreviewMode && "cursor-not-allowed opacity-70")}
                    data-testid="input-total-minutes"
                  />
                  <p className="text-xs text-muted-foreground ml-1">The full interview length, including introductions, Q&A, and wrap-up.</p>
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
                    Screening Q&A Time (min)
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="interview-duration"
                    type="number"
                    min={1}
                    required
                    disabled={isPreviewMode}
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
                    className={cn(
                      "h-14 text-lg font-semibold rounded-2xl border-border/60 bg-background/50 focus-visible:ring-primary/20 focus-visible:border-primary transition-all px-5",
                      (triedToAdvance && isScreeningTimeMissing) && "border-destructive/70 ring-1 ring-destructive/20",
                      isScreeningExceedsInterview && "border-destructive ring-1 ring-destructive/30",
                      isPreviewMode && "cursor-not-allowed opacity-70"
                    )}
                    data-testid="input-screening-time"
                  />
                  <p className="text-xs text-muted-foreground ml-1">Time dedicated just to asking screening questions. AI will fit the right number of questions here.</p>
                  {triedToAdvance && isScreeningTimeMissing && (
                    <p className="text-sm text-destructive font-medium flex items-center gap-1.5 ml-1" role="alert">
                      <Info className="w-3.5 h-3.5" />
                      Required. Enter screening time in minutes.
                    </p>
                  )}
                  {isScreeningExceedsInterview && (
                    <p className="text-sm text-destructive font-medium flex items-center gap-1.5 ml-1" role="alert">
                      <Info className="w-3.5 h-3.5" />
                      Screening time must be less than or equal to total interview time.
                    </p>
                  )}
                </div>
              </div>

              {typeof totalMinutes === "number" && totalMinutes > 0 && typeof interviewDuration === "number" && interviewDuration > 0 && !isScreeningExceedsInterview && (
                <div className="p-5 rounded-2xl bg-primary/[0.03] border border-primary/10">
                  <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/70 mb-3 flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    Your Interview Breakdown
                  </p>
                  <div className="flex items-center gap-2 h-8 rounded-xl overflow-hidden">
                    <div
                      className="h-full bg-muted/60 rounded-l-lg flex items-center justify-center px-3 text-[10px] font-bold text-muted-foreground whitespace-nowrap"
                      style={{ width: `${Math.max(15, (5 / totalMinutes) * 100)}%` }}
                    >
                      Intro
                    </div>
                    <div
                      className="h-full bg-primary/20 flex items-center justify-center px-3 text-[10px] font-bold text-primary whitespace-nowrap"
                      style={{ width: `${Math.max(20, (interviewDuration / totalMinutes) * 100)}%` }}
                    >
                      Screening ({interviewDuration} min)
                    </div>
                    <div
                      className="h-full bg-muted/60 rounded-r-lg flex items-center justify-center px-3 text-[10px] font-bold text-muted-foreground whitespace-nowrap flex-1"
                    >
                      Follow-ups & Wrap-up ({totalMinutes - interviewDuration} min)
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">AI will generate precise questions that fit within your {interviewDuration}-minute screening window.</p>
                </div>
              )}

              <div className="space-y-3">
                <Label htmlFor="company-website" className="text-xs font-black uppercase tracking-widest text-muted-foreground/70 ml-1 flex items-center gap-2">
                  <Globe className="w-3 h-3" />
                  Company Website
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="company-website"
                  type="url"
                  required
                  disabled={isPreviewMode}
                  value={companyWebsite}
                  onChange={(e) => setCompanyWebsite(e.target.value)}
                  placeholder="https://company.com"
                  className={cn("h-14 text-base font-medium rounded-2xl border-border/60 bg-background/50 focus-visible:ring-primary/20 focus-visible:border-primary transition-all px-5", triedToAdvance && isCompanyWebsiteMissing && "border-destructive/70 ring-1 ring-destructive/20", isPreviewMode && "cursor-not-allowed opacity-70")}
                  data-testid="input-company-website"
                />
                <p className="text-xs text-muted-foreground ml-1">Helps AI tailor questions to your company's industry and context.</p>
                {triedToAdvance && isCompanyWebsiteMissing && (
                  <p className="text-sm text-destructive font-medium flex items-center gap-1.5 ml-1" role="alert">
                    <Info className="w-3.5 h-3.5" />
                    Required.
                  </p>
                )}
              </div>

              <div className="space-y-3 relative" style={{ zIndex: 100 }}>
                <Label htmlFor="location" className="text-xs font-black uppercase tracking-widest text-muted-foreground/70 ml-1 flex items-center gap-2">
                  Location
                  <span className="text-destructive">*</span>
                </Label>
                <LocationCombobox
                  id="location"
                  value={location}
                  onChange={setLocation}
                  placeholder="Search city worldwide..."
                  data-testid="input-location"
                  disabled={isPreviewMode}
                  className={triedToAdvance && isLocationMissing ? "border-destructive/70 ring-1 ring-destructive/20" : undefined}
                />
                <p className="text-xs text-muted-foreground ml-1">Where the role is based. AI uses this for location-relevant questions.</p>
                {triedToAdvance && isLocationMissing && (
                  <p className="text-sm text-destructive font-medium flex items-center gap-1.5 ml-1" role="alert">
                    <Info className="w-3.5 h-3.5" />
                    Required.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end items-center gap-3 pt-6">
              {isPreviewMode ? (
                <Button
                  onClick={() => setSetupStep(2)}
                  className="rounded-xl px-8 font-bold shadow-lg shadow-primary/20 gap-2 h-12 w-full sm:w-auto bg-green-600 hover:bg-green-700"
                >
                  <Check className="w-4 h-4" />
                  Accept & Continue
                  <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
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
              )}
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
              {!isPreviewMode && (
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
              )}
            </div>
            <CardDescription className="text-base font-medium ml-13 mt-2">
              Paste the job description below. Our AI will analyze the requirements and create targeted screening questions with grading rubrics so you can evaluate candidates like an expert.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-10 pt-0 space-y-6">
            <div className="relative group">
              <Textarea
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                placeholder="Paste the full job description here..."
                readOnly={isPreviewMode}
                className={cn("min-h-[400px] text-base font-medium rounded-[2rem] border-border/60 bg-background/50 focus-visible:ring-primary/20 focus-visible:border-primary transition-all p-8 resize-none leading-relaxed", isPreviewMode && "cursor-not-allowed opacity-70")}
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
              <Button variant="ghost" onClick={() => isPreviewMode ? setSetupStep(1) : changeSetupStep(1)} className="rounded-xl font-bold h-12 px-6 gap-2 w-full sm:w-auto order-2 sm:order-1" data-testid="button-back-step-2">
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto order-1 sm:order-2">
                {isPreviewMode ? (
                  <Button
                    onClick={() => setSetupStep(3)}
                    className="rounded-xl px-8 font-bold shadow-lg shadow-primary/20 gap-2 h-12 bg-green-600 hover:bg-green-700"
                  >
                    <Check className="w-4 h-4" />
                    Accept & Continue
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : (
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
                      changeSetupStep(3);
                    }}
                    className="rounded-xl px-8 font-bold shadow-lg shadow-primary/20 gap-2 h-12"
                    disabled={!jdText.trim()}
                  >
                    Next: SME Notes
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
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
              <CardTitle className="text-2xl font-black tracking-tight">Subject Matter Expert Notes</CardTitle>
            </div>
            <CardDescription className="text-base font-medium ml-13">
              What does the hiring team or department head care about most? These notes help AI ask the right questions even if you're not the technical expert.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-10 pt-0 space-y-8">
            <div className="space-y-4">
              <Textarea
                value={smeNotes}
                onChange={(e) => setSmeNotes(e.target.value)}
                placeholder={"What matters most for this role? For example:\n\n- \"The VP of Engineering wants someone who can design scalable systems\"\n- \"Must have experience with our tech stack: React, Node.js, AWS\"\n- \"Communication skills are more important than years of experience\"\n- \"Ask about their approach to code reviews and mentoring\""}
                readOnly={isPreviewMode}
                className={cn("min-h-[300px] text-base font-medium rounded-[2rem] border-border/60 bg-background/50 focus-visible:ring-primary/20 focus-visible:border-primary transition-all p-8 resize-none leading-relaxed", isPreviewMode && "cursor-not-allowed opacity-70")}
                data-testid="textarea-sme"
              />
            </div>

            {!isPreviewMode && (
              <div className="p-6 rounded-[2rem] bg-primary/[0.03] border border-primary/10 flex items-center gap-6">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Sparkles className="w-7 h-7 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-black text-foreground/80 uppercase tracking-widest leading-none mb-1.5">Ready to Generate</h4>
                  <p className="text-sm text-muted-foreground font-medium">AI will create precise screening questions with grading rubrics, fitted exactly to your screening time.</p>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-6">
              <Button variant="ghost" onClick={() => isPreviewMode ? setSetupStep(2) : changeSetupStep(2)} className="rounded-xl font-bold h-12 px-6 gap-2 w-full sm:w-auto" data-testid="button-back-step-3">
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>

              {isPreviewMode ? (
                <Button
                  onClick={() => navigate("/dashboard")}
                  className="rounded-xl px-8 h-12 font-black text-base shadow-lg shadow-green-500/20 gap-2.5 w-full sm:w-auto bg-green-600 hover:bg-green-700 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <Check className="w-4 h-4" />
                  Accept & Finish
                </Button>
              ) : hasExistingQuestions && !hasEditsSinceGeneration ? (
                <Button
                  onClick={() => navigate(`/projects/${id}/questions${isPreviewMode ? '?preview=true' : ''}`)}
                  className="rounded-xl px-8 h-12 font-black text-base shadow-lg shadow-primary/20 gap-2.5 w-full sm:w-auto bg-primary hover:scale-[1.02] active:scale-[0.98] transition-all"
                  data-testid="button-next-step"
                >
                  Next Step
                  <ChevronRight className="w-4 h-4" />
                </Button>
              ) : hasExistingQuestions && hasEditsSinceGeneration ? (
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
                        Your inputs have changed. Regenerating will replace your existing questions with new ones tailored to the updated job description, guidance notes, and time settings.
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
                        Candiq AI will analyze your job description and expert guidance to generate precise screening questions with grading rubrics, fitted to your screening time.
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
