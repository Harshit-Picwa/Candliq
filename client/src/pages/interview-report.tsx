import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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
} from "lucide-react";
import { format } from "date-fns";

const decisionStyles = {
  Hire: { variant: "default" as const, icon: CheckCircle, color: "text-green-500" },
  "No-Hire": { variant: "destructive" as const, icon: XCircle, color: "text-destructive" },
  Hold: { variant: "secondary" as const, icon: AlertCircle, color: "text-amber-500" },
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
        <div className="min-h-screen bg-background">
          <Header />
          <main className="max-w-4xl mx-auto px-8 py-12">
            <Skeleton className="h-8 w-64 mb-8" />
            <Skeleton className="h-[600px] w-full" />
          </main>
        </div>
      </DesktopOnlyGuard>
    );
  }

  if (!report) {
    return (
      <DesktopOnlyGuard>
        <div className="min-h-screen bg-background">
          <Header />
          <main className="max-w-4xl mx-auto px-8 py-12">
            <div className="flex items-center gap-4 mb-8">
              <Button variant="ghost" size="icon" asChild>
                <Link href={`/projects/${project?.id}/interviews`}>
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </Button>
              <h1 className="text-2xl font-semibold">Interview Report</h1>
            </div>
            <Card className="p-12">
              <div className="text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">Report not available</h3>
                <p className="text-muted-foreground">
                  This interview hasn't been completed yet or the report is still being generated.
                </p>
              </div>
            </Card>
          </main>
        </div>
      </DesktopOnlyGuard>
    );
  }

  const decision = report.recommendation.decision;
  const DecisionIcon = decisionStyles[decision].icon;

  return (
    <DesktopOnlyGuard>
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-4xl mx-auto px-8 py-12">
          <div className="flex items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" asChild>
                <Link href={`/projects/${project?.id}/interviews`}>
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl font-semibold">Interview Report</h1>
                <p className="text-muted-foreground">
                  Generated {format(new Date(report.generatedAt), "MMMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
            </div>
            <Button variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Export PDF
            </Button>
          </div>

          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-7 h-7 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">{interview?.candidateName}</h2>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Briefcase className="w-4 h-4" />
                        {project?.title}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {format(new Date(interview?.createdAt || ""), "MMM d, yyyy")}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-start md:items-end gap-2">
                  <Badge
                    variant={decisionStyles[decision].variant}
                    className="text-base px-4 py-1.5 gap-2"
                    data-testid="badge-decision"
                  >
                    <DecisionIcon className="w-4 h-4" />
                    {decision}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap" data-testid="text-summary">
                {report.summary}
              </p>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Recommendation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-4">
                <div className={`p-2 rounded-lg ${decision === "Hire" ? "bg-green-500/10" : decision === "No-Hire" ? "bg-destructive/10" : "bg-amber-500/10"}`}>
                  <DecisionIcon className={`w-6 h-6 ${decisionStyles[decision].color}`} />
                </div>
                <div>
                  <h3 className="font-medium mb-1">{decision}</h3>
                  <p className="text-muted-foreground" data-testid="text-recommendation-reason">
                    {report.recommendation.reason}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="w-5 h-5" />
                Competency Scores
              </CardTitle>
              <CardDescription>
                Performance across key competencies for this role
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                {report.competencies.map((comp) => (
                  <div key={comp.competencyId} className="space-y-2" data-testid={`competency-score-${comp.competencyId}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{comp.name}</span>
                      <Badge variant={comp.score >= 4 ? "default" : comp.score >= 3 ? "secondary" : "outline"}>
                        {comp.score}/5
                      </Badge>
                    </div>
                    <Progress value={comp.score * 20} className="h-2" />
                    <p className="text-xs text-muted-foreground">{comp.reason}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {report.evidence && report.evidence.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Quote className="w-5 h-5" />
                  Evidence & Key Points
                </CardTitle>
                <CardDescription>
                  Notable observations from the interview
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {report.evidence.map((ev, idx) => (
                    <div key={idx} className="flex gap-4" data-testid={`evidence-point-${idx}`}>
                      <div className="w-1.5 rounded-full bg-primary/20 flex-shrink-0" />
                      <div>
                        <p className="text-sm">{ev.point}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Related to: {ev.competency}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </DesktopOnlyGuard>
  );
}
