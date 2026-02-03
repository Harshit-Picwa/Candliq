import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import { 
  Briefcase, 
  Loader2, 
  Mail, 
  Lock, 
  User, 
  Sparkles,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Zap,
  Globe,
  Eye,
  EyeOff
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function LoginPage() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated && location === "/login") {
      navigate("/dashboard");
    }
  }, [isAuthenticated, isLoading, navigate, location]);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupFirstName, setSignupFirstName] = useState("");
  const [signupLastName, setSignupLastName] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Login failed");
      }

      return response.json();
    },
    onSuccess: async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Welcome back!", description: "You've been logged in successfully." });
      setTimeout(() => {
        navigate("/dashboard");
      }, 200);
    },
    onError: (error: any) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    },
  });

  const signupMutation = useMutation({
    mutationFn: async ({
      email,
      password,
      firstName,
      lastName,
    }: {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
    }) => {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, firstName, lastName }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Signup failed");
      }

      return response.json();
    },
    onSuccess: async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Account created!", description: "Welcome to Candiq.AI!" });
      setTimeout(() => {
        navigate("/dashboard");
      }, 200);
    },
    onError: (error: any) => {
      toast({
        title: "Signup failed",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      toast({
        title: "Missing fields",
        description: "Please enter both email and password",
        variant: "destructive",
      });
      return;
    }
    loginMutation.mutate({ email: loginEmail, password: loginPassword });
  };

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupEmail || !signupPassword) {
      toast({
        title: "Missing fields",
        description: "Please enter email and password",
        variant: "destructive",
      });
      return;
    }
    if (signupPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }
    signupMutation.mutate({
      email: signupEmail,
      password: signupPassword,
      firstName: signupFirstName || undefined,
      lastName: signupLastName || undefined,
    });
  };

  const passwordStrength = signupPassword.length >= 8;

  return (
    <div className="min-h-screen flex flex-col bg-background relative selection:bg-primary/10 selection:text-primary overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/[0.03] rounded-full blur-[120px] -mr-40 -mt-40 animate-pulse" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-primary/[0.03] rounded-full blur-[120px] -ml-40 -mb-40 animate-pulse delay-700" />
      </div>

      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="flex h-16 items-center justify-between gap-4 px-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <Briefcase className="w-4.5 h-4.5 text-primary-foreground stroke-[2.5]" />
            </div>
            <span className="text-xl font-black tracking-tighter bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Candiq.AI
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 relative z-10">
        <div className="w-full max-w-[440px] space-y-10">
          {/* Welcome Header */}
          <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-[0.2em] mb-2 shadow-sm">
              <Sparkles className="w-3 h-3" />
              Intelligence Driven Hiring
            </div>
            <h1 className="text-4xl font-black tracking-tight text-foreground/90">
              Secure Access
            </h1>
            <p className="text-muted-foreground font-medium text-base">
              Sign in to your dashboard to manage projects and live interviews.
            </p>
          </div>

          {/* Auth Card */}
          <Card className="rounded-[2.5rem] border-border/40 bg-card shadow-2xl shadow-primary/5 overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-1000">
            <CardContent className="p-8">
              <Tabs defaultValue="login" className="w-full">
                <TabsList className="grid w-full grid-cols-2 p-1 bg-muted/50 rounded-2xl h-12 mb-8">
                  <TabsTrigger value="login" className="rounded-xl font-bold gap-2 data-[state=active]:shadow-md data-[state=active]:bg-background">
                    <Lock className="w-3.5 h-3.5" />
                    Log In
                  </TabsTrigger>
                  <TabsTrigger value="signup" className="rounded-xl font-bold gap-2 data-[state=active]:shadow-md data-[state=active]:bg-background">
                    <User className="w-3.5 h-3.5" />
                    Sign Up
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="space-y-6 mt-0 animate-in fade-in slide-in-from-right-4 duration-500">
                  <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-3">
                      <Label htmlFor="login-email" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Email Address</Label>
                      <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
                        <Input
                          id="login-email"
                          type="email"
                          placeholder="you@company.com"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          required
                          disabled={loginMutation.isPending}
                          className="h-14 pl-12 rounded-2xl border-border/60 bg-muted/30 focus-visible:ring-primary/20 focus-visible:border-primary transition-all font-medium"
                        />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="login-password" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Secure Password</Label>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
                        <Input
                          id="login-password"
                          type={showLoginPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          required
                          disabled={loginMutation.isPending}
                          className="h-14 pl-12 pr-12 rounded-2xl border-border/60 bg-muted/30 focus-visible:ring-primary/20 focus-visible:border-primary transition-all font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
                          tabIndex={-1}
                          aria-label={showLoginPassword ? "Hide password" : "Show password"}
                        >
                          {showLoginPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                        </button>
                      </div>
                    </div>
                    <Button
                      type="submit"
                      size="lg"
                      className="w-full h-14 rounded-2xl text-base font-black shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Authenticating...
                        </>
                      ) : (
                        <>
                          Enter Dashboard
                          <ArrowRight className="w-5 h-5 ml-2 stroke-[3]" />
                        </>
                      )}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup" className="space-y-6 mt-0 animate-in fade-in slide-in-from-left-4 duration-500">
                  <form onSubmit={handleSignup} className="space-y-6">
                    <div className="space-y-3">
                      <Label htmlFor="signup-email" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Email Address</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="you@company.com"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        required
                        disabled={signupMutation.isPending}
                        className="h-14 rounded-2xl border-border/60 bg-muted/30 focus-visible:ring-primary/20 focus-visible:border-primary transition-all font-medium px-5"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="signup-password" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Password</Label>
                      <div className="relative group">
                        <Input
                          id="signup-password"
                          type={showSignupPassword ? "text" : "password"}
                          placeholder="Min. 8 characters"
                          value={signupPassword}
                          onChange={(e) => setSignupPassword(e.target.value)}
                          required
                          minLength={8}
                          disabled={signupMutation.isPending}
                          className="h-14 rounded-2xl border-border/60 bg-muted/30 focus-visible:ring-primary/20 focus-visible:border-primary transition-all font-medium pl-5 pr-12"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSignupPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
                          tabIndex={-1}
                          aria-label={showSignupPassword ? "Hide password" : "Show password"}
                        >
                          {showSignupPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 px-1">
                        {passwordStrength ? (
                          <div className="flex items-center gap-1.5 text-green-600">
                            <CheckCircle2 className="w-3 h-3 stroke-[3]" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Strength Verified</span>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">At least 8 characters required</span>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <Label htmlFor="signup-firstname" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">First Name</Label>
                        <Input
                          id="signup-firstname"
                          type="text"
                          placeholder="Jane"
                          value={signupFirstName}
                          onChange={(e) => setSignupFirstName(e.target.value)}
                          disabled={signupMutation.isPending}
                          className="h-14 rounded-2xl border-border/60 bg-muted/30 focus-visible:ring-primary/20 focus-visible:border-primary transition-all font-medium px-5"
                        />
                      </div>
                      <div className="space-y-3">
                        <Label htmlFor="signup-lastname" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Last Name</Label>
                        <Input
                          id="signup-lastname"
                          type="text"
                          placeholder="Doe"
                          value={signupLastName}
                          onChange={(e) => setSignupLastName(e.target.value)}
                          disabled={signupMutation.isPending}
                          className="h-14 rounded-2xl border-border/60 bg-muted/30 focus-visible:ring-primary/20 focus-visible:border-primary transition-all font-medium px-5"
                        />
                      </div>
                    </div>
                    <Button
                      type="submit"
                      size="lg"
                      className="w-full h-14 rounded-2xl text-base font-black shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                      disabled={signupMutation.isPending || !passwordStrength}
                    >
                      {signupMutation.isPending ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Creating Account...
                        </>
                      ) : (
                        <>
                          Create My Account
                          <ArrowRight className="w-5 h-5 ml-2 stroke-[3]" />
                        </>
                      )}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Features Preview */}
          <div className="grid grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
            {[
              { icon: Sparkles, label: "AI Powered" },
              { icon: Zap, label: "Real-time" },
              { icon: ShieldCheck, label: "Encrypted" }
            ].map((feat, i) => (
              <div key={i} className="group p-4 rounded-3xl bg-muted/20 border border-border/40 backdrop-blur-sm transition-all hover:bg-muted/40 text-center">
                <div className="w-10 h-10 rounded-2xl bg-background border border-border/60 flex items-center justify-center mx-auto mb-3 shadow-sm group-hover:scale-110 transition-transform">
                  <feat.icon className="w-5 h-5 text-primary stroke-[2]" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80">{feat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
      
      <footer className="py-8 px-6 text-center relative z-10">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">
          &copy; {new Date().getFullYear()} Candiq.AI • Enterprise Grade Hiring
        </p>
      </footer>
    </div>
  );
}
