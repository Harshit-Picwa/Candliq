import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Header } from "@/components/header";
import { DesktopOnlyGuard } from "@/components/desktop-only-guard";
import { StageProgressBar } from "@/components/stage-progress-bar";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, Interview } from "@shared/schema";
import { ArrowLeft, Plus, User, MoreVertical, Trash2, Play, FileText, Clock, Mail, Calendar, Loader2 } from "lucide-react";
import { format } from "date-fns";

const statusStyles: Record<string, { variant: any, className: string, label: string }> = {
  draft: { 
    variant: "secondary", 
    className: "bg-muted text-muted-foreground border-transparent",
    label: "Draft" 
  },
  in_progress: { 
    variant: "default", 
    className: "bg-primary/10 text-primary border-primary/20 animate-pulse",
    label: "In Progress" 
  },
  completed: { 
    variant: "outline", 
    className: "bg-green-500/10 text-green-600 border-green-500/20",
    label: "Completed" 
  },
};

export default function InterviewsListPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
  });

  const { data: interviews, isLoading: interviewsLoading } = useQuery<Interview[]>({
    queryKey: ["/api/projects", projectId, "interviews"],
  });

  const createInterview = useMutation({
    mutationFn: async (data: { candidateName: string; candidateEmail: string }) => {
      return apiRequest("POST", `/api/projects/${projectId}/interviews`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "interviews"] });
      setIsCreateOpen(false);
      setCandidateName("");
      setCandidateEmail("");
      toast({ title: "Interview created", description: "Ready to start interviewing." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create interview.", variant: "destructive" });
    },
  });

  const deleteInterview = useMutation({
    mutationFn: async (interviewId: number) => {
      return apiRequest("DELETE", `/api/interviews/${interviewId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "interviews"] });
      toast({ title: "Interview deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete interview.", variant: "destructive" });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (candidateName.trim()) {
      createInterview.mutate({ candidateName: candidateName.trim(), candidateEmail: candidateEmail.trim() });
    }
  };

  const isLoading = projectLoading || interviewsLoading;

  if (isLoading) {
    return (
      <DesktopOnlyGuard>
        <div className="min-h-screen page-gradient">
          <Header />
          <main className="max-w-5xl mx-auto px-8 py-12">
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
        <main className="max-w-5xl mx-auto px-8 py-12">
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" size="icon" asChild className="rounded-full hover:bg-background/80">
              <Link href={`/projects/${projectId}`}>
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-bold py-0 h-5 px-2 rounded-md bg-background/50 border-primary/20 text-primary/80">
                  Project Interviews
                </Badge>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground/90">{project?.title}</h1>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogContent className="rounded-3xl border-border/40 shadow-2xl">
                <form onSubmit={handleCreate}>
                  <DialogHeader className="space-y-3">
                    <DialogTitle className="text-2xl font-black tracking-tight">New Interview</DialogTitle>
                    <DialogDescription className="text-base font-medium leading-relaxed">
                      Enter candidate details to initialize their interview session.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-8 space-y-6">
                    <div className="space-y-3">
                      <Label htmlFor="name" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Full Name</Label>
                      <Input
                        id="name"
                        placeholder="e.g., John Smith"
                        value={candidateName}
                        onChange={(e) => setCandidateName(e.target.value)}
                        className="h-14 text-base font-semibold rounded-2xl border-border/60 bg-muted/30 focus-visible:ring-primary/20 focus-visible:border-primary transition-all px-5"
                        data-testid="input-candidate-name"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Email Address (Optional)</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="e.g., john@example.com"
                        value={candidateEmail}
                        onChange={(e) => setCandidateEmail(e.target.value)}
                        className="h-14 text-base font-semibold rounded-2xl border-border/60 bg-muted/30 focus-visible:ring-primary/20 focus-visible:border-primary transition-all px-5"
                        data-testid="input-candidate-email"
                      />
                    </div>
                  </div>
                  <DialogFooter className="gap-3 sm:gap-0">
                    <Button type="button" variant="ghost" className="rounded-xl font-bold h-12 px-6" onClick={() => setIsCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" size="lg" className="rounded-xl font-black h-12 px-8 shadow-lg shadow-primary/20" disabled={createInterview.isPending || !candidateName.trim()} data-testid="button-submit-interview">
                      {createInterview.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : "Create Interview"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="mb-6 max-w-4xl mx-auto">
            <StageProgressBar
              currentStage={3}
              onStageClick={(s) => {
                if (s === 1) navigate(`/projects/${projectId}`);
                if (s === 2) navigate(`/projects/${projectId}/questions`);
              }}
              clickableStages={[1, 2]}
            />
          </div>
          <div className="flex items-center justify-center mb-6">
            <p className="text-xs font-medium text-muted-foreground">Stage 3: Ready for interview — add candidates and start screening</p>
          </div>

          {!interviews || interviews.length === 0 ? (
            <Card className="rounded-[3rem] border-dashed border-2 border-border/60 bg-card/30 backdrop-blur-sm p-24 shadow-inner shadow-black/5">
              <div className="text-center max-w-md mx-auto">
                <div className="mx-auto w-28 h-24 rounded-[2.5rem] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-10 ring-8 ring-primary/5 shadow-inner">
                  <User className="w-12 h-12 text-primary/60 stroke-[1.5]" />
                </div>
                <h3 className="text-2xl font-black mb-4 text-foreground/80 tracking-tight">No Interviews Yet</h3>
                <p className="text-muted-foreground mb-12 text-lg font-medium leading-relaxed">
                  Start your hiring journey by adding your first candidate for the {project?.title} role.
                </p>
                <Button size="lg" className="rounded-2xl h-14 px-10 font-black text-base shadow-2xl shadow-primary/30 transition-all hover:scale-105 active:scale-95" onClick={() => setIsCreateOpen(true)} data-testid="button-create-first-interview">
                  <Plus className="w-6 h-6 mr-2 stroke-[3]" />
                  Add First Candidate
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4">
              {interviews.map((interview) => {
                const style = statusStyles[interview.status];
                return (
                  <Card key={interview.id} className="group rounded-[2rem] border-border/40 bg-card hover:bg-background shadow-sm hover:shadow-xl hover:shadow-primary/5 transition-all duration-500 overflow-hidden" data-testid={`card-interview-${interview.id}`}>
                    <CardHeader className="flex flex-row items-center gap-6 p-6">
                      <div className="w-14 h-14 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500">
                        <User className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <CardTitle className="text-xl font-black tracking-tight text-foreground/90">{interview.candidateName}</CardTitle>
                          <Badge 
                            variant={style.variant} 
                            className={`rounded-full px-3 py-0 h-6 text-[10px] font-black uppercase tracking-widest ${style.className}`}
                          >
                            {style.label}
                          </Badge>
                        </div>
                        <CardDescription className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-2">
                          {interview.candidateEmail && (
                            <span className="flex items-center gap-2 font-semibold text-xs text-muted-foreground">
                              <Mail className="w-3.5 h-3.5" />
                              {interview.candidateEmail}
                            </span>
                          )}
                          <span className="flex items-center gap-2 font-semibold text-xs text-muted-foreground">
                            <Calendar className="w-3.5 h-3.5" />
                            Added {format(new Date(interview.createdAt), "MMM d, yyyy")}
                          </span>
                        </CardDescription>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {interview.status === "completed" && interview.reportJson && (
                          <Button variant="outline" className="rounded-xl font-bold border-border/60 hover:bg-muted h-11 px-5 shadow-sm group/btn transition-all" asChild>
                            <Link href={`/interviews/${interview.id}/report`}>
                              <FileText className="w-4 h-4 mr-2 text-primary group-hover/btn:scale-110 transition-transform" />
                              Report
                            </Link>
                          </Button>
                        )}
                        {interview.status !== "completed" && (
                          <Button className={`rounded-xl font-black h-11 px-6 shadow-lg shadow-primary/20 gap-2 transition-all ${interview.status === "in_progress" ? "bg-primary" : ""}`} asChild data-testid={`button-start-interview-${interview.id}`}>
                            <Link href={`/interviews/${interview.id}/cockpit`}>
                              <Play className={`w-4 h-4 ${interview.status === "in_progress" ? "fill-white" : "fill-primary-foreground"}`} />
                              {interview.status === "in_progress" ? "Resume" : "Start"}
                            </Link>
                          </Button>
                        )}
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-xl opacity-40 group-hover:opacity-100 transition-all hover:bg-muted shrink-0" data-testid={`button-interview-menu-${interview.id}`}>
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" sideOffset={8} className="rounded-xl border-border/40 shadow-xl z-[100]">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive font-bold text-xs p-3 rounded-lg"
                              onClick={() => deleteInterview.mutate(interview.id)}
                              data-testid={`button-delete-interview-${interview.id}`}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete Candidate
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </DesktopOnlyGuard>
  );
}
