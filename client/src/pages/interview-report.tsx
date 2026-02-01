import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Header } from "@/components/header";
import { DesktopOnlyGuard } from "@/components/desktop-only-guard";
import type { Project, Interview } from "@shared/schema";
import {
  ArrowLeft,
  Download,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  User,
  Briefcase,
  Quote,
  Target,
  FileText,
  Sparkles,
  ChevronRight,
  Trophy,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";

const decisionStyles = {
  Hire: { 
    variant: "default" as const, 
    icon: CheckCircle, 
    color: "text-green-600",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
    label: "Recommended Hire"
  },
  "No-Hire": { 
    variant: "destructive" as const, 
    icon: XCircle, 
    color: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/20",
    label: "Not Recommended"
  },
  Hold: { 
    variant: "secondary" as const, 
    icon: AlertCircle, 
    color: "text-amber-600",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    label: "Further Review Needed"
  },
};

export default function InterviewReportPage() {
  const { id: interviewId } = useParams<{ id: string }>();

  const { data: interview, isLoading: interviewLoading } = useQuery<Interview>({
    queryKey: ["/api/interviews", interviewId],
  });

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", interview?.projectId],
    enabled: !!interview?.projectId,
  });

  const report = interview?.reportJson;
  const isLoading = interviewLoading || projectLoading;

  if (isLoading) {
    return (
      <DesktopOnlyGuard>
        <div className="min-h-screen page-gradient">
          <Header />
          <main className="max-w-5xl mx-auto px-8 py-12">
            <Skeleton className="h-10 w-64 mb-12 rounded-xl" />
            <div className="grid gap-8">
              <Skeleton className="h-48 w-full rounded-[2.5rem]" />
              <div className="grid md:grid-cols-3 gap-8">
                <Skeleton className="h-[400px] md:col-span-2 rounded-[2.5rem]" />
                <Skeleton className="h-[400px] rounded-[2.5rem]" />
              </div>
            </div>
          </main>
        </div>
      </DesktopOnlyGuard>
    );
  }

  if (!report) {
    return (
      <DesktopOnlyGuard>
        <div className="min-h-screen page-gradient">
          <Header />
          <main className="max-w-4xl mx-auto px-8 py-12">
            <div className="flex items-center gap-4 mb-12">
              <Button variant="ghost" size="icon" asChild className="rounded-full">
                <Link href={`/projects/${project?.id}/interviews`}>
                  <ArrowLeft className="w-5 h-5" />
                </Link>
              </Button>
              <h1 className="text-2xl font-black tracking-tight">Interview Report</h1>
            </div>
            <Card className="rounded-[3rem] border-dashed border-2 border-border/60 bg-card/30 backdrop-blur-sm p-24">
              <div className="text-center max-w-md mx-auto">
                <div className="mx-auto w-24 h-24 rounded-[2rem] bg-muted flex items-center justify-center mb-8">
                  <AlertCircle className="w-12 h-12 text-muted-foreground/40" />
                </div>
                <h3 className="text-2xl font-black mb-4 text-foreground/80 tracking-tight">Report Pending</h3>
                <p className="text-muted-foreground mb-8 text-lg font-medium leading-relaxed">
                  This interview is still in progress or the AI is finalizing the evaluation report.
                </p>
                <Button variant="outline" asChild className="rounded-2xl px-10 font-bold border-border/60">
                  <Link href={`/projects/${project?.id}/interviews`}>Back to Interviews</Link>
                </Button>
              </div>
            </Card>
          </main>
        </div>
      </DesktopOnlyGuard>
    );
  }

  const decision = report.recommendation.decision;
  const style = decisionStyles[decision];
  const DecisionIcon = style.icon;

  return (
    <DesktopOnlyGuard>
      <div className="min-h-screen page-gradient">
        <Header />
        <main className="max-w-5xl mx-auto px-8 py-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
            <div className="flex items-center gap-5">
              <Button variant="ghost" size="icon" asChild className="rounded-full hover:bg-background/80 h-12 w-12 shrink-0">
                <Link href={`/projects/${project?.id}/interviews`}>
                  <ArrowLeft className="w-6 h-6" />
                </Link>
              </Button>
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge variant="outline" className="text-[10px] uppercase tracking-widest font-black py-0 h-5 px-2 rounded-md bg-primary/5 border-primary/20 text-primary">
                    Evaluation Report
                  </Badge>
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
                    {format(new Date(report.generatedAt), "MMM d, yyyy")}
                  </span>
                </div>
                <h1 className="text-3xl font-black tracking-tight text-foreground/90">Results Analysis</h1>
              </div>
            </div>
            <Button variant="outline" className="rounded-xl font-bold border-border/60 hover:bg-background/60 gap-2 h-12 px-6 shadow-sm">
              <Download className="w-4 h-4" />
              Export Report
            </Button>
          </div>

          <div className="grid gap-8">
            {/* Header Identity Card */}
            <Card className="rounded-[2.5rem] border-border/40 shadow-xl shadow-primary/5 overflow-hidden bg-card/50 backdrop-blur-sm relative">
              <div className={`absolute top-0 right-0 w-64 h-64 ${style.bg} blur-[100px] -mr-32 -mt-32 opacity-50`} />
              <CardContent className="p-10 relative z-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-10">
                  <div className="flex items-center gap-8">
                    <div className="w-24 h-24 rounded-[2rem] bg-primary/5 border border-primary/10 flex items-center justify-center shadow-inner">
                      <User className="w-10 h-10 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-4xl font-black tracking-tighter text-foreground/90 mb-3">{interview?.candidateName}</h2>
                      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-xl bg-muted/50 flex items-center justify-center">
                            <Briefcase className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <span className="font-bold text-sm text-foreground/70 tracking-tight">{project?.title}</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-xl bg-muted/50 flex items-center justify-center">
                            <Clock className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <span className="font-bold text-sm text-foreground/70 tracking-tight">
                            Interviewed {format(new Date(interview?.createdAt || ""), "MMM d")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-center gap-3 bg-background/40 backdrop-blur-md p-6 rounded-[2rem] border border-border/40 shadow-lg min-w-[240px]">
                    <div className={`h-14 w-14 rounded-2xl ${style.bg} flex items-center justify-center ${style.color}`}>
                      <DecisionIcon className="w-8 h-8 stroke-[2.5]" />
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 mb-1">AI Recommendation</p>
                      <p className={`text-xl font-black tracking-tight ${style.color}`}>{style.label}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-7 space-y-8">
                {/* Summary Section */}
                <Card className="rounded-[2.5rem] border-border/40 shadow-xl shadow-primary/5 bg-background overflow-hidden">
                  <CardHeader className="p-8 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-primary" />
                      </div>
                      <CardTitle className="text-sm font-black uppercase tracking-widest text-foreground/80">Executive Summary</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8 pt-0">
                    <div className="relative">
                      <Quote className="absolute -left-2 -top-2 w-12 h-12 text-primary/5 -z-0" />
                      <p className="text-base font-medium text-foreground/70 leading-relaxed relative z-10 whitespace-pre-wrap" data-testid="text-summary">
                        {report.summary}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Recommendation Detail */}
                <Card className={`rounded-[2.5rem] border-2 ${style.border} ${style.bg} shadow-xl shadow-primary/5 overflow-hidden`}>
                  <CardHeader className="p-8 pb-4">
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-xl bg-background flex items-center justify-center ${style.color}`}>
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <CardTitle className="text-sm font-black uppercase tracking-widest text-foreground/80">Decision Rational</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8 pt-0">
                    <p className="text-base font-bold text-foreground/80 leading-relaxed" data-testid="text-recommendation-reason">
                      {report.recommendation.reason}
                    </p>
                  </CardContent>
                </Card>

                {/* Evidence Section */}
                {report.evidence && report.evidence.length > 0 && (
                  <Card className="rounded-[2.5rem] border-border/40 shadow-xl shadow-primary/5 bg-background overflow-hidden">
                    <CardHeader className="p-8 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Trophy className="w-4 h-4 text-primary" />
                        </div>
                        <CardTitle className="text-sm font-black uppercase tracking-widest text-foreground/80">Key Evidence Points</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="p-8 pt-0">
                      <div className="grid gap-4">
                        {report.evidence.map((ev, idx) => (
                          <div key={idx} className="group flex gap-5 p-5 rounded-2xl bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors" data-testid={`evidence-point-${idx}`}>
                            <div className="h-10 w-10 rounded-xl bg-background border border-border/60 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-110 transition-transform">
                              <span className="text-xs font-black text-primary">{idx + 1}</span>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground/80 leading-relaxed mb-2">{ev.point}</p>
                              <Badge variant="outline" className="rounded-lg bg-background/50 border-primary/10 text-[9px] font-black uppercase tracking-[0.1em] text-primary/70 h-5">
                                {ev.competency}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="lg:col-span-5 space-y-8">
                {/* Competency Scores */}
                <Card className="rounded-[2.5rem] border-border/40 shadow-xl shadow-primary/5 bg-background overflow-hidden sticky top-8">
                  <CardHeader className="p-8 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Target className="w-4 h-4 text-primary" />
                      </div>
                      <CardTitle className="text-sm font-black uppercase tracking-widest text-foreground/80">Competency Matrix</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8 pt-4 space-y-10">
                    {report.competencies.map((comp) => (
                      <div key={comp.competencyId} className="space-y-4" data-testid={`competency-score-${comp.competencyId}`}>
                        <div className="flex items-end justify-between px-1">
                          <div>
                            <h4 className="text-sm font-black text-foreground/90 tracking-tight leading-none mb-1">{comp.name}</h4>
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Performance Level</p>
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-primary tracking-tighter">{comp.score}</span>
                            <span className="text-[10px] font-black text-muted-foreground/30 uppercase">/ 5</span>
                          </div>
                        </div>
                        <div className="h-3 w-full bg-muted/50 rounded-full overflow-hidden p-0.5 border border-border/40 shadow-inner">
                          <div 
                            className={`h-full rounded-full transition-all duration-1000 ${
                              comp.score >= 4 ? "bg-primary shadow-[0_0_15px_rgba(var(--primary),0.4)]" : 
                              comp.score >= 3 ? "bg-primary/60" : "bg-destructive/60"
                            }`}
                            style={{ width: `${(comp.score / 5) * 100}%` }}
                          />
                        </div>
                        <div className="flex gap-3 p-4 rounded-2xl bg-muted/20 border border-border/20">
                          <Info className="w-3.5 h-3.5 text-muted-foreground/40 mt-0.5 shrink-0" />
                          <p className="text-xs font-medium text-muted-foreground leading-relaxed">{comp.reason}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
    </DesktopOnlyGuard>
  );
}
