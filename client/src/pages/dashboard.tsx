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
import { Plus, Briefcase, Users, FileText, MoreVertical, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";

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
          <div className="flex items-center justify-between mb-10">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
              <p className="text-muted-foreground mt-1.5 text-base">
                Manage your interview projects and candidates
              </p>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="shadow-md hover:shadow-lg transition-shadow" data-testid="button-create-project">
                  <Plus className="w-4 h-4 mr-2" />
                  New Project
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreate}>
                  <DialogHeader>
                    <DialogTitle>Create new project</DialogTitle>
                    <DialogDescription>
                      Start by giving your project a name. You can add job details later.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <Label htmlFor="title">Project title</Label>
                    <Input
                      id="title"
                      placeholder="e.g., Senior Software Engineer"
                      value={newProjectTitle}
                      onChange={(e) => setNewProjectTitle(e.target.value)}
                      className="mt-2"
                      data-testid="input-project-title"
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createProject.isPending} data-testid="button-submit-project">
                      {createProject.isPending ? "Creating..." : "Create"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2 mt-2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : projects && projects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project) => (
                <Card key={project.id} className="group card-elevated rounded-2xl border-card-border/80 overflow-hidden" data-testid={`card-project-${project.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
                    <div className="flex-1 min-w-0">
                      <Link href={`/projects/${project.id}`}>
                        <CardTitle className="text-lg font-semibold hover:text-primary cursor-pointer truncate transition-colors">
                          {project.title}
                        </CardTitle>
                      </Link>
                      <CardDescription className="mt-1.5">
                        Created {format(new Date(project.createdAt), "MMM d, yyyy")}
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`button-project-menu-${project.id}`}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => deleteProject.mutate(project.id)}
                          data-testid={`button-delete-project-${project.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-5 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        <span>{project.jdText ? "JD added" : "No JD"}</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5">
                        <Users className="w-3.5 h-3.5" />
                        <span>{(project.screeningQuestionsJson?.length || 0)} questions</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="rounded-2xl border-card-border/80 overflow-hidden card-elevated p-16">
              <div className="text-center max-w-md mx-auto">
                <div className="mx-auto w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 ring-2 ring-primary/10">
                  <Briefcase className="w-10 h-10 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
                <p className="text-muted-foreground mb-8 leading-relaxed">
                  Create your first project to start building screening questions and interviewing candidates.
                </p>
                <Button className="shadow-md hover:shadow-lg transition-shadow" onClick={() => setIsCreateOpen(true)} data-testid="button-create-first-project">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Project
                </Button>
              </div>
            </Card>
          )}
        </main>
      </div>
    </DesktopOnlyGuard>
  );
}
