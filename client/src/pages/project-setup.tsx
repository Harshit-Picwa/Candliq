import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Header } from "@/components/header";
import { DesktopOnlyGuard } from "@/components/desktop-only-guard";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project } from "@shared/schema";
import { ArrowLeft, FileText, Brain, Loader2, Sparkles, Users, ChevronRight, Upload, X, CheckCircle } from "lucide-react";

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
  const [interviewDuration, setInterviewDuration] = useState<number>(30);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (project) {
      setTitle(project.title);
      setJdText(project.jdText || "");
      setSmeNotes(project.smeNotesText || "");
      setCompanyWebsite((project as any).companyWebsite || "");
      setInterviewDuration((project as any).interviewDuration || 30);
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

  const uploadPDF = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("pdf", file);
      
      setUploading(true);
      setUploadProgress(0);
      
      // Simulate progress (since we can't track actual upload progress easily)
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);
      
      try {
        const response = await fetch(`/api/projects/${id}/upload-jd`, {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        
        clearInterval(progressInterval);
        setUploadProgress(100);
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Upload failed");
        }
        
        const result = await response.json();
        return result;
      } finally {
        setTimeout(() => {
          setUploading(false);
          setUploadProgress(0);
        }, 500);
      }
    },
    onSuccess: (data) => {   
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      setJdText(data.jdText || "");
      toast({ title: "PDF uploaded", description: "Text extracted from PDF successfully." });
    },
    onError: (error: any) => {
      toast({ 
        title: "Upload failed", 
        description: error?.message || "Failed to upload PDF.", 
        variant: "destructive" 
      });
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

  const handleSave = () => {
    updateProject.mutate({ 
      title, 
      jdText, 
      smeNotesText: smeNotes,
      companyWebsite: companyWebsite || undefined,
      interviewDuration: interviewDuration || undefined,
    });
  };

  const handleGenerate = async () => {
    if (!jdText.trim()) {
      toast({ title: "Job description required", description: "Please add a job description first.", variant: "destructive" });
      return;
    }
    
    try {
      // First, save the project with the JD
      await updateProject.mutateAsync({ 
        title, 
        jdText, 
        smeNotesText: smeNotes,
        companyWebsite: companyWebsite || undefined,
        interviewDuration: interviewDuration || undefined,
      });
      
      // Wait a moment for the database to update
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Then generate questions
      generateQuestions.mutate();
    } catch (error: any) {
      toast({ 
        title: "Save failed", 
        description: error?.message || "Failed to save project before generating questions.", 
        variant: "destructive" 
      });
    }
  };

  const handleFileSelect = (file: File) => {
    if (file.type !== "application/pdf") {
      toast({ title: "Invalid file type", description: "Only PDF files are allowed.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "PDF must be less than 10MB.", variant: "destructive" });
      return;
    }
    setUploadedFileName(file.name);
    uploadPDF.mutate(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  if (isLoading) {
    return (
      <DesktopOnlyGuard>
        <div className="min-h-screen bg-background">
          <Header />
          <main className="max-w-4xl mx-auto px-8 py-12">
            <Skeleton className="h-8 w-64 mb-8" />
            <Skeleton className="h-[400px] w-full" />
          </main>
        </div>
      </DesktopOnlyGuard>
    );
  }

  return (
    <DesktopOnlyGuard>
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-4xl mx-auto px-8 py-12">
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>
            <div className="flex-1">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-2xl font-semibold border-none px-0 focus-visible:ring-0"
                placeholder="Project title"
                data-testid="input-project-title"
              />
            </div>
            <Button onClick={handleSave} disabled={updateProject.isPending} variant="outline" data-testid="button-save">
              {updateProject.isPending ? "Saving..." : "Save"}
            </Button>
          </div>

          <div className="flex gap-2 mb-8">
            <Link href={`/projects/${id}`}>
              <Button variant="secondary" size="sm">Setup</Button>
            </Link>
            <Link href={`/projects/${id}/questions`}>
              <Button variant="ghost" size="sm">Questions</Button>
            </Link>
            <Link href={`/projects/${id}/interviews`}>
              <Button variant="ghost" size="sm">Interviews</Button>
            </Link>
          </div>

          <Tabs defaultValue="jd" className="space-y-6">
            <TabsList>
              <TabsTrigger value="jd" className="gap-2" data-testid="tab-jd">
                <FileText className="w-4 h-4" />
                Job Description
              </TabsTrigger>
              <TabsTrigger value="sme" className="gap-2" data-testid="tab-sme">
                <Brain className="w-4 h-4" />
                SME Notes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="jd">
              <Card>
                <CardHeader>
                  <CardTitle>Job Description</CardTitle>
                  <CardDescription>
                    Upload a PDF or paste the job description. This will be used to extract competencies and generate screening questions.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                      dragActive
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-muted-foreground/50"
                    } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    <input
                      type="file"
                      id="pdf-upload"
                      accept=".pdf"
                      onChange={handleFileInput}
                      className="hidden"
                    />
                    <label
                      htmlFor="pdf-upload"
                      className="cursor-pointer flex flex-col items-center gap-2"
                    >
                      <Upload className="w-8 h-8 text-muted-foreground" />
                      <div>
                        <span className="text-sm font-medium text-primary">Click to upload</span> or drag and drop
                      </div>
                      <p className="text-xs text-muted-foreground">PDF file (max 10MB)</p>
                    </label>
                    {uploading && (
                      <div className="mt-4">
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Uploading... {uploadProgress}%</p>
                      </div>
                    )}
                    {uploadedFileName && !uploading && (
                      <div className="mt-4 flex items-center justify-center gap-2 text-sm text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        <span>{uploadedFileName}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUploadedFileName(null);
                          }}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Or paste text</span>
                    </div>
                  </div>
                  <Textarea
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                    placeholder="Paste the full job description here..."
                    className="min-h-[300px] font-mono text-sm"
                    data-testid="textarea-jd"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sme">
              <Card>
                <CardHeader>
                  <CardTitle>SME Notes</CardTitle>
                  <CardDescription>
                    Add any subject matter expert notes: ideal candidate profile, red flags to watch for, specific skills to probe, etc.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={smeNotes}
                    onChange={(e) => setSmeNotes(e.target.value)}
                    placeholder="E.g., 'Must have experience with distributed systems. Look for red flags around collaboration...'"
                    className="min-h-[300px]"
                    data-testid="textarea-sme"
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="space-y-6 mt-8">
            <Card>
              <CardHeader>
                <CardTitle>Campaign Settings</CardTitle>
                <CardDescription>
                  Configure interview duration and company information to customize question generation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="interview-duration">Interview Duration (minutes)</Label>
                  <select
                    id="interview-duration"
                    value={interviewDuration}
                    onChange={(e) => setInterviewDuration(parseInt(e.target.value))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value={15}>15 minutes (6 questions)</option>
                    <option value={20}>20 minutes (7 questions)</option>
                    <option value={30}>30 minutes (8 questions)</option>
                    <option value={45}>45 minutes (9 questions)</option>
                    <option value={60}>60 minutes (10 questions)</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Question count will be adjusted based on duration: {interviewDuration <= 20 ? 6 : interviewDuration <= 30 ? 8 : interviewDuration <= 45 ? 9 : 10} questions
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-website">Company Website (Optional)</Label>
                  <Input
                    id="company-website"
                    type="url"
                    value={companyWebsite}
                    onChange={(e) => setCompanyWebsite(e.target.value)}
                    placeholder="https://example.com"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    AI will analyze the company website to understand culture and adjust questions accordingly
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 p-6 rounded-lg bg-card border">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-medium">Generate Screening Questions</h3>
                <p className="text-sm text-muted-foreground">
                  AI will extract competencies and create questions with rubrics
                </p>
              </div>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={generateQuestions.isPending || !jdText.trim()}
              className="gap-2"
              data-testid="button-generate-questions"
            >
              {generateQuestions.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  Generate Questions
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </main>
      </div>
    </DesktopOnlyGuard>
  );
}
