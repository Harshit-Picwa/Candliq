import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Briefcase, FileText, Mic, Brain, CheckCircle, ClipboardList, ArrowRight } from "lucide-react";
import { Link } from "wouter";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between gap-4 px-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold tracking-tight">Candiq.AI</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button asChild data-testid="button-login-header">
              <a href="/api/login">Log in</a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="py-20 px-6">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Brain className="w-4 h-4" />
              AI-Powered Interview Assistant
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-6">
              Interview like a Subject Matter Expert
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Even if you're not the technical expert, Candiq.AI generates precise screening questions
              that fit your interview time. Just add the job description and let AI do the heavy lifting.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" asChild data-testid="button-get-started">
                <a href="/api/login" className="gap-2">
                  Get Started Free
                  <ArrowRight className="w-4 h-4" />
                </a>
              </Button>
              <p className="text-sm text-muted-foreground">No credit card required</p>
            </div>
          </div>
        </section>

        <section className="py-16 px-6 bg-card/50">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-semibold mb-4">How it works</h2>
              <p className="text-muted-foreground">Three simple steps to expert-level interviews</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="relative overflow-hidden">
                <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                  1
                </div>
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">Set Up in 3 Steps</CardTitle>
                  <CardDescription>
                    Enter your interview timing, paste the job description, and add any guidance from your hiring team.
                    AI generates precise screening questions fitted to your time.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="relative overflow-hidden">
                <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                  2
                </div>
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <Mic className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">Run Live Interviews</CardTitle>
                  <CardDescription>
                    Capture audio from your video call. Get real-time transcription and 
                    AI-suggested follow-up questions as you interview.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="relative overflow-hidden">
                <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                  3
                </div>
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <ClipboardList className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">Get Structured Reports</CardTitle>
                  <CardDescription>
                    Receive competency-based evaluations with hire/no-hire recommendations 
                    backed by evidence from the interview.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-16 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-semibold mb-4">Built for non-technical interviewers</h2>
              <p className="text-muted-foreground">Interview any role with confidence</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                "Works with any role - technical or non-technical",
                "No bots join your meeting - completely silent",
                "Generates questions aligned with job requirements",
                "Real-time transcription with speaker labels",
                "AI suggests follow-ups based on candidate answers",
                "Competency-based scoring with evidence",
                "Exportable interview reports",
                "Privacy-first: no raw audio stored",
              ].map((feature, i) => (
                <div key={i} className="flex items-start gap-3 p-4 rounded-lg bg-card">
                  <CheckCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 px-6 bg-primary text-primary-foreground">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-semibold mb-4">
              Ready to interview like an expert?
            </h2>
            <p className="text-primary-foreground/80 mb-8">
              Start for free. No credit card required.
            </p>
            <Button size="lg" variant="secondary" asChild data-testid="button-cta-bottom">
              <a href="/api/login" className="gap-2">
                Get Started
                <ArrowRight className="w-4 h-4" />
              </a>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <Briefcase className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="font-medium">Candiq.AI</span>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Candiq.AI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
