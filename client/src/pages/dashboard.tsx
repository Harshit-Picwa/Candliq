import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Header } from "@/components/header";
import { DesktopOnlyGuard } from "@/components/desktop-only-guard";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project } from "@shared/schema";
import { Plus, Briefcase, Users, FileText, MoreVertical, Trash2, Loader2, ChevronRight, User, MapPin } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

function ProjectCardSkeleton() {
  return (
    <div className="rounded-[2rem] border border-border/40 bg-card overflow-hidden shadow-sm">
      <div className="p-8 pb-4">
        <Skeleton className="h-6 w-3/4 rounded-lg" />
        <Skeleton className="mt-3 h-3 w-28 rounded-md" />
      </div>
      <div className="p-8 pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-8 w-20 rounded-xl" />
          <Skeleton className="h-8 w-24 rounded-xl" />
        </div>
        <div className="mt-8 flex items-center justify-between">
          <div className="flex -space-x-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-7 w-7 rounded-full border-2 border-card" />
            ))}
          </div>
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      console.log("[Dashboard] User not authenticated, redirecting to login");
      setLocation("/login");
    }
  }, [isAuthenticated, authLoading, setLocation]);

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Don't render dashboard if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [deletingProjectId, setDeletingProjectId] = useState<number | null>(null);

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const createProject = useMutation({
    mutationFn: async (title: string) => {
      return apiRequest("POST", "/api/projects", { title });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setIsCreateOpen(false);
      setNewProjectTitle("");
      toast({ title: "Project created", description: "Your new project is ready." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create project.", variant: "destructive" });
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete project.", variant: "destructive" });
    },
    onSettled: () => {
      setDeletingProjectId(null);
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newProjectTitle.trim()) {
      createProject.mutate(newProjectTitle.trim());
    }
  };

  return (
    <DesktopOnlyGuard>
      <div className="min-h-screen page-gradient">
        <Header />
        <main className="max-w-7xl mx-auto px-8 py-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-[10px] uppercase tracking-widest font-black py-0 h-5 px-2 rounded-md bg-primary/5 border-primary/20 text-primary">
                  Workspace
                </Badge>
              </div>
              <h1 className="text-4xl font-black tracking-tight text-foreground/90">Your Projects</h1>
              <p className="text-muted-foreground mt-2 text-lg font-medium leading-relaxed max-w-2xl">
                Streamline your hiring process with AI-powered interview intelligence.
              </p>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="lg" className="rounded-2xl px-8 font-bold shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]" data-testid="button-create-project">
                  <Plus className="w-5 h-5 mr-2 stroke-[3]" />
                  New Project
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-3xl border-border/40 shadow-2xl">
                <form onSubmit={handleCreate}>
                  <DialogHeader className="space-y-3">
                    <DialogTitle className="text-2xl font-black tracking-tight">Create Project</DialogTitle>
                    <DialogDescription className="text-base font-medium leading-relaxed">
                      What role are you hiring for? You can customize the details in the next step.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-8">
                    <Label htmlFor="title" className="text-xs font-black uppercase tracking-widest text-muted-foreground/70 mb-3 block">Role Title</Label>
                    <Input
                      id="title"
                      placeholder="e.g., Senior Full Stack Engineer"
                      value={newProjectTitle}
                      onChange={(e) => setNewProjectTitle(e.target.value)}
                      className="h-14 text-lg font-semibold rounded-2xl border-border/60 bg-muted/30 focus-visible:ring-primary/20 focus-visible:border-primary transition-all px-5"
                      data-testid="input-project-title"
                      autoFocus
                    />
                  </div>
                  <DialogFooter className="gap-3 sm:gap-0">
                    <Button type="button" variant="ghost" className="rounded-xl font-bold h-12 px-6" onClick={() => setIsCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" size="lg" className="rounded-xl font-black h-12 px-8 shadow-lg shadow-primary/20" disabled={createProject.isPending} data-testid="button-submit-project">
                      {createProject.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : "Create Project"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <ProjectCardSkeleton key={i} />
              ))}
            </div>
          ) : projects && projects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {createProject.isPending && (
                <div aria-hidden>
                  <ProjectCardSkeleton />
                </div>
              )}
              {projects.map((project) =>
                deletingProjectId === project.id ? (
                  <div key={project.id} aria-busy aria-label="Deleting project">
                    <ProjectCardSkeleton />
                  </div>
                ) : (
                <Card
                  key={project.id}
                  className="group relative rounded-[2rem] border-border/40 bg-card hover:bg-background shadow-sm hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500 overflow-hidden cursor-pointer"
                  data-testid={`card-project-${project.id}`}
                >
                  <Link
                    href={
                      // Navigate to saved stage, or default based on project progress
                      (project as any).currentStage === 3
                        ? `/projects/${project.id}/interviews`
                        : (project as any).currentStage === 2 || (project.screeningQuestionsJson?.length || 0) > 0
                          ? `/projects/${project.id}/questions`
                          : `/projects/${project.id}`
                    }
                    className="absolute inset-0 z-10"
                  />
                  <div className="absolute top-6 right-6 z-20" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-muted shrink-0" data-testid={`button-project-menu-${project.id}`}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" sideOffset={8} className="rounded-xl border-border/40 shadow-xl z-[100]">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive font-bold text-xs p-3 rounded-lg"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeletingProjectId(project.id);
                            deleteProject.mutate(project.id);
                          }}
                          data-testid={`button-delete-project-${project.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Project
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardHeader className="relative z-0 flex flex-row items-start justify-between gap-4 p-8 pb-4">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-xl font-black tracking-tight text-foreground/90 leading-tight group-hover:text-primary transition-colors">
                        {project.title}
                      </CardTitle>
                      <CardDescription className="mt-2 flex flex-col gap-1.5 font-bold text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60">
                        <div className="flex items-center gap-2">
                          <Briefcase className="w-3 h-3" />
                          Created {format(new Date(project.createdAt), "MMM d")}
                        </div>
                        {(project.locationCity || project.locationState || project.locationCountry) && (
                          <div className="flex items-center gap-2 text-primary/70">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate">
                              {[project.locationCity, project.locationState, project.locationCountry].filter(Boolean).join(", ")}
                            </span>
                          </div>
                        )}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="relative z-0 p-8 pt-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <Link href={`/projects/${project.id}?step=2`} className="relative z-30">
                        <div className="flex items-center gap-2 rounded-xl bg-muted/40 border border-border/20 px-3 py-1.5 transition-all hover:bg-primary/10 hover:border-primary/20 hover:scale-105 active:scale-95 group/badge cursor-pointer">
                          <FileText className={`w-3.5 h-3.5 ${project.jdText ? "text-primary" : "text-muted-foreground/40"}`} />
                          <span className={`text-[10px] font-black uppercase tracking-widest ${project.jdText ? "text-foreground/80" : "text-muted-foreground/60"}`}>
                            {project.jdText ? "JD Active" : "No JD"}
                          </span>
                        </div>
                      </Link>
                      <Link href={`/projects/${project.id}/questions`} className="relative z-30">
                        <div className="flex items-center gap-2 rounded-xl bg-muted/40 border border-border/20 px-3 py-1.5 transition-all hover:bg-primary/10 hover:border-primary/20 hover:scale-105 active:scale-95 group/badge cursor-pointer">
                          <Users className={`w-3.5 h-3.5 ${(project.screeningQuestionsJson?.length || 0) > 0 ? "text-primary" : "text-muted-foreground/40"}`} />
                          <span className={`text-[10px] font-black uppercase tracking-widest ${(project.screeningQuestionsJson?.length || 0) > 0 ? "text-foreground/80" : "text-muted-foreground/60"}`}>
                            {(project.screeningQuestionsJson?.length || 0)} Questions
                          </span>
                        </div>
                      </Link>
                    </div>

                    <div className="mt-8 flex items-center justify-between relative z-30">
                      <Link href={`/projects/${project.id}/interviews`} className="flex -space-x-2 hover:scale-105 transition-transform">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="h-7 w-7 rounded-full border-2 border-card bg-muted flex items-center justify-center transition-transform group-hover:-translate-y-1">
                            <User className="h-3.5 w-3.5 text-muted-foreground/60" />
                          </div>
                        ))}
                      </Link>
                      <div className="h-8 w-8 rounded-full bg-primary/5 border border-primary/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all -translate-x-4 group-hover:translate-x-0 pointer-events-none">
                        <ChevronRight className="w-4 h-4 text-primary" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                )
              )}
            </div>
          ) : createProject.isPending ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <ProjectCardSkeleton />
            </div>
          ) : (
            <Card className="rounded-[3rem] border-dashed border-2 border-border/60 bg-card/30 backdrop-blur-sm p-24 shadow-inner shadow-black/5">
              <div className="text-center max-w-md mx-auto">
                <div className="mx-auto w-28 h-24 rounded-[2.5rem] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-10 ring-8 ring-primary/5 shadow-inner">
                  <Briefcase className="w-12 h-12 text-primary/60 stroke-[1.5]" />
                </div>
                <h3 className="text-3xl font-black mb-4 text-foreground/80 tracking-tight">Your hiring hub is empty</h3>
                <p className="text-muted-foreground mb-12 text-lg font-medium leading-relaxed">
                  Start by creating a project for the role you're hiring for. We'll handle the rest with AI.
                </p>
                <Button size="lg" className="rounded-2xl h-14 px-10 font-black text-base shadow-2xl shadow-primary/30 transition-all hover:scale-105 active:scale-95" onClick={() => setIsCreateOpen(true)} data-testid="button-create-first-project">
                  <Plus className="w-6 h-6 mr-2 stroke-[3]" />
                  Create First Project
                </Button>
              </div>
            </Card>
          )}
        </main>
      </div>
    </DesktopOnlyGuard>
  );
}
