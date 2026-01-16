import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import DashboardPage from "@/pages/dashboard";
import ProjectSetupPage from "@/pages/project-setup";
import QuestionsSetupPage from "@/pages/questions-setup";
import InterviewsListPage from "@/pages/interviews-list";
import InterviewCockpitPage from "@/pages/interview-cockpit";
import InterviewReportPage from "@/pages/interview-report";

function AuthenticatedRouter() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/projects/:id" component={ProjectSetupPage} />
      <Route path="/projects/:id/questions" component={QuestionsSetupPage} />
      <Route path="/projects/:id/interviews" component={InterviewsListPage} />
      <Route path="/interviews/:id/cockpit" component={InterviewCockpitPage} />
      <Route path="/interviews/:id/report" component={InterviewReportPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <AuthenticatedRouter />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
