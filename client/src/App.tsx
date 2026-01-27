import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import ProjectSetupPage from "@/pages/project-setup";
import QuestionsSetupPage from "@/pages/questions-setup";
import InterviewsListPage from "@/pages/interviews-list";
import InterviewCockpitPage from "@/pages/interview-cockpit";
import InterviewReportPage from "@/pages/interview-report";

const protectedRoutes = ["/dashboard", "/projects", "/interviews"];

function AuthenticatedRouter() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  // Check for force-logout query parameter (for development/testing)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("logout") === "true") {
      // Clear session and redirect to login
      fetch("/api/auth/clear-session", { credentials: "include" })
        .then(() => {
          window.location.href = "/login";
        })
        .catch((err) => {
          console.error("Error clearing session:", err);
          window.location.href = "/login";
        });
    }
  }, []);

  // Redirect to login if unauthenticated user tries to access protected routes or root
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const isProtectedRoute = protectedRoutes.some(route => location.startsWith(route));
      // Also redirect if accessing root path (/) when not authenticated
      const isRootPath = location === "/";
      if ((isProtectedRoute || isRootPath) && location !== "/login" && location !== "/") {
        console.log("[App] Redirecting unauthenticated user to /login from:", location);
        setLocation("/login");
      }
    }
  }, [isAuthenticated, isLoading, location, setLocation]);
  
  // Redirect authenticated users from root path to dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated && location === "/") {
      console.log("[App] Redirecting authenticated user from / to /dashboard");
      setLocation("/dashboard");
    }
  }, [isAuthenticated, isLoading, location, setLocation]);

  // Also redirect authenticated users away from login page
  useEffect(() => {
    if (!isLoading && isAuthenticated && location === "/login") {
      console.log("[App] Redirecting authenticated user from /login to /dashboard");
      setLocation("/dashboard");
    }
  }, [isAuthenticated, isLoading, location, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      {isAuthenticated ? (
        <>
          {/* Protected routes - only accessible when authenticated */}
          <Route path="/dashboard" component={DashboardPage} />
          <Route path="/projects/:id" component={ProjectSetupPage} />
          <Route path="/projects/:id/questions" component={QuestionsSetupPage} />
          <Route path="/projects/:id/interviews" component={InterviewsListPage} />
          <Route path="/interviews/:id/cockpit" component={InterviewCockpitPage} />
          <Route path="/interviews/:id/report" component={InterviewReportPage} />
          <Route path="/" component={DashboardPage} />
          <Route component={NotFound} />
        </>
      ) : (
        <>
          {/* Public routes - accessible without authentication */}
          <Route path="/" component={LandingPage} />
          {/* Catch-all: redirect any other route to login */}
          <Route component={LoginPage} />
        </>
      )}
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
