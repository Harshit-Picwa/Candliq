import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Header } from "@/components/header";
import { DesktopOnlyGuard } from "@/components/desktop-only-guard";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, Interview } from "@shared/schema";
import { ArrowLeft, Plus, User, MoreVertical, Trash2, Play, FileText, Clock, Settings, Brain } from "lucide-react";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  draft: "secondary",
  in_progress: "default",
  completed: "outline",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  completed: "Completed",
};

export default function InterviewsListPage() {
  const { id: projectId } = useParams<{ id: string }>();
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
          <main className="max-w-4xl mx-auto px-8 py-12">
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
        <main className="max-w-4xl mx-auto px-8 py-12">
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/projects/${projectId}`}>
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold tracking-tight">{project?.title}</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Interviews</p>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="shadow-sm" data-testid="button-create-interview">
                  <Plus className="w-4 h-4 mr-2" />
                  New Interview
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreate}>
                  <DialogHeader>
                    <DialogTitle>New interview</DialogTitle>
                    <DialogDescription>
                      Add candidate details to start a new interview session.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div>
                      <Label htmlFor="name">Candidate name *</Label>
                      <Input
                        id="name"
                        placeholder="e.g., John Smith"
                        value={candidateName}
                        onChange={(e) => setCandidateName(e.target.value)}
                        className="mt-2"
                        data-testid="input-candidate-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Candidate email (optional)</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="e.g., john@example.com"
                        value={candidateEmail}
                        onChange={(e) => setCandidateEmail(e.target.value)}
                        className="mt-2"
                        data-testid="input-candidate-email"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createInterview.isPending || !candidateName.trim()} data-testid="button-submit-interview">
                      {createInterview.isPending ? "Creating..." : "Create"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex gap-2 mb-8 bg-muted/30 p-1 rounded-xl w-fit mx-auto border border-border/50">
            <Link href={`/projects/${projectId}`}>
              <Button variant="ghost" size="sm" className="rounded-lg px-6 text-muted-foreground">
                <Settings className="w-4 h-4 mr-2" />
                1. Setup
              </Button>
            </Link>
            <Link href={`/projects/${projectId}/questions`}>
              <Button variant="ghost" size="sm" className="rounded-lg px-6 text-muted-foreground">
                <Brain className="w-4 h-4 mr-2" />
                2. Questions
              </Button>
            </Link>
            <Link href={`/projects/${projectId}/interviews`}>
              <Button variant="secondary" size="sm" className="rounded-lg px-6">
                <User className="w-4 h-4 mr-2" />
                3. Interviews
              </Button>
            </Link>
          </div>

          {!interviews || interviews.length === 0 ? (
            <Card className="rounded-2xl border-card-border/80 card-elevated p-16">
              <div className="text-center max-w-md mx-auto">
                <div className="mx-auto w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 ring-2 ring-primary/10">
                  <User className="w-10 h-10 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No interviews yet</h3>
                <p className="text-muted-foreground mb-8 leading-relaxed">
                  Create your first interview for this role.
                </p>
                <Button className="shadow-sm" onClick={() => setIsCreateOpen(true)} data-testid="button-create-first-interview">
                  <Plus className="w-4 h-4 mr-2" />
                  New Interview
                </Button>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {interviews.map((interview) => (
                <Card key={interview.id} className="group card-elevated rounded-2xl border-card-border/80 overflow-hidden" data-testid={`card-interview-${interview.id}`}>
                  <CardHeader className="flex flex-row items-center gap-4 py-4">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{interview.candidateName}</CardTitle>
                        <Badge variant={statusColors[interview.status] as any}>
                          {statusLabels[interview.status]}
                        </Badge>
                      </div>
                      <CardDescription className="flex items-center gap-4 mt-1">
                        {interview.candidateEmail && <span>{interview.candidateEmail}</span>}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(interview.createdAt), "MMM d, yyyy")}
                        </span>
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {interview.status === "completed" && interview.reportJson && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/interviews/${interview.id}/report`}>
                            <FileText className="w-4 h-4 mr-2" />
                            View Report
                          </Link>
                        </Button>
                      )}
                      {interview.status !== "completed" && (
                        <Button size="sm" asChild data-testid={`button-start-interview-${interview.id}`}>
                          <Link href={`/interviews/${interview.id}/cockpit`}>
                            <Play className="w-4 h-4 mr-2" />
                            {interview.status === "in_progress" ? "Resume" : "Start"}
                          </Link>
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`button-interview-menu-${interview.id}`}>
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => deleteInterview.mutate(interview.id)}
                            data-testid={`button-delete-interview-${interview.id}`}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    </DesktopOnlyGuard>
  );
}
