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
import { Header } from "@/components/header";
import { DesktopOnlyGuard } from "@/components/desktop-only-guard";
import { StageProgressBar } from "@/components/stage-progress-bar";
import { ProjectLayout } from "@/components/project-layout";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { Project, Interview } from "@shared/schema";
import { ArrowLeft, Plus, User, Trash2, Loader2, Mail, Calendar, CheckCircle, AlertCircle, MessageSquare, ExternalLink, MapPin, Search, ChevronRight, PlayCircle, History, Clock, Settings } from "lucide-react";
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
    <ProjectLayout
      project={project}
      isLoading={isLoading}
      currentStage={3}
      stageDescription="Stage 3: Ready for interview — add candidates and start screening"
      onStageClick={(s) => {
        if (s === 1) navigate(`/projects/${projectId}`);
        if (s === 2) navigate(`/projects/${projectId}/questions`);
      }}
      clickableStages={[1, 2]}
      actions={
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
      }
    >

      {!interviews || interviews.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-12"
        >
          <Card className="rounded-[3rem] border-dashed border-2 border-border/60 bg-card/30 backdrop-blur-sm p-24 shadow-inner shadow-black/5">
            <CardContent className="flex flex-col items-center justify-center text-center p-0">
              <div className="w-24 h-24 rounded-full bg-primary/5 flex items-center justify-center mb-8 ring-1 ring-primary/20">
                <User className="w-10 h-10 text-primary/40" />
              </div>
              <h3 className="text-3xl font-black tracking-tight text-foreground/80 mb-3">No Candidates Yet</h3>
              <p className="text-muted-foreground font-medium max-w-sm mx-auto leading-relaxed mb-10">
                Add your first candidate to begin the screening process and evaluate their skills with AI.
              </p>
              <Button
                size="lg"
                onClick={() => setIsCreateOpen(true)}
                className="rounded-[2rem] px-10 h-14 font-black shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all text-base"
                data-testid="button-add-candidate-empty"
              >
                <Plus className="w-5 h-5 mr-3 stroke-[3]" />
                Add First Candidate
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="grid gap-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-2">Total Candidates ({interviews.length})</h2>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="rounded-xl text-[10px] font-black uppercase tracking-widest text-muted-foreground h-8 px-3 hover:bg-muted/60">
                Export All
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {interviews.map((interview, index) => {
                const status = interview.status === "completed" ? "completed" : (interview.transcriptJson?.length ? "in-progress" : "draft");
                return (
                  <motion.div
                    key={interview.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                  >
                    <Card className="group rounded-[2rem] border-border/40 shadow-xl shadow-black/5 hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500 overflow-hidden bg-white/40 dark:bg-card/40 backdrop-blur-xl ring-1 ring-white/10 dark:ring-white/5">
                      <CardContent className="p-0">
                        {/* Card Header Section */}
                        <div className="p-6 pb-4 flex items-start justify-between">
                          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/15 flex items-center justify-center border border-primary/10 group-hover:scale-110 transition-transform duration-500 shadow-inner">
                            <User className="w-7 h-7 text-primary/60" />
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 hover:bg-muted/60">
                                <Settings className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl border-border/40 shadow-2xl">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:bg-destructive/5 cursor-pointer font-bold gap-2">
                                    <Trash2 className="w-4 h-4" /> Delete Profile
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-3xl">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete {interview.candidateName}'s interview record and all associated data.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel className="rounded-xl font-bold">Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteInterview.mutate(interview.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl font-bold"
                                    >
                                      {deleteInterview.isPending ? "Deleting..." : "Delete Permanently"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Candidate Info */}
                        <div className="px-6 space-y-1">
                          <h3 className="text-xl font-black tracking-tight text-foreground/90 group-hover:text-primary transition-colors truncate">
                            {interview.candidateName}
                          </h3>
                          <div className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                            <Mail className="w-3 h-3 opacity-60" />
                            <span className="truncate">{interview.candidateEmail || "No Email Provided"}</span>
                          </div>
                        </div>

                        {/* Status and Stats */}
                        <div className="px-6 py-4 flex flex-wrap items-center gap-2">
                          {status === "completed" ? (
                            <Badge className="bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20 rounded-lg px-2.5 py-0.5 font-black text-[10px] uppercase tracking-wider gap-1.5 ring-1 ring-green-500/10">
                              <CheckCircle className="w-3 h-3" /> Screened
                            </Badge>
                          ) : status === "in-progress" ? (
                            <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20 rounded-lg px-2.5 py-0.5 font-black text-[10px] uppercase tracking-wider gap-1.5 ring-1 ring-blue-500/10">
                              <Clock className="w-3 h-3" /> In Progress
                            </Badge>
                          ) : (
                            <Badge className="bg-muted/40 text-muted-foreground border-border/40 hover:bg-muted/60 rounded-lg px-2.5 py-0.5 font-black text-[10px] uppercase tracking-wider gap-1.5">
                              <History className="w-3 h-3" /> Ready
                            </Badge>
                          )}

                          <div className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest ml-auto">
                            ID: {interview.id.toString().substring(0, 8)}
                          </div>
                        </div>

                        {/* Actions Bar */}
                        <div className="mt-2 p-4 pt-2 border-t border-border/10 bg-muted/20 flex gap-2">
                          {status === "completed" ? (
                            <Button asChild className="flex-1 rounded-xl bg-primary shadow-lg shadow-primary/20 font-black text-xs gap-2 h-11 transition-all hover:scale-[1.02] active:scale-[0.98]">
                              <Link href={`/projects/${projectId}/interviews/${interview.id}/report`}>
                                <ExternalLink className="w-3.5 h-3.5" /> View Evaluation
                              </Link>
                            </Button>
                          ) : (
                            <>
                              <Button asChild variant="outline" className="flex-1 rounded-xl border-border/60 font-black text-xs gap-2 h-11 bg-background/50 hover:bg-background/80 transition-all hover:border-primary/40">
                                <Link href={`/projects/${projectId}/interviews/${interview.id}/cockpit`}>
                                  <PlayCircle className="w-3.5 h-3.5 text-primary" />
                                  {status === "in-progress" ? "Resume" : "Start Now"}
                                </Link>
                              </Button>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}
    </ProjectLayout>
  );
}
