import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Briefcase, FileText, Mic, Brain, CheckCircle, ClipboardList, ArrowRight, Sparkles, Target, Zap, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background selection:bg-primary/10 selection:text-primary">
      {/* Background Decor */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/5 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/[0.02] rounded-full blur-[160px]" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-primary/5 rounded-full blur-[120px] animate-pulse delay-1000" />
      </div>

      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="flex h-16 items-center justify-between gap-4 px-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <Briefcase className="w-5 h-5 text-primary-foreground stroke-[2.5]" />
            </div>
            <span className="text-xl font-black tracking-tighter bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Candiq.AI
            </span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Button variant="ghost" className="font-bold rounded-xl hidden sm:inline-flex" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button className="rounded-xl font-black px-6 shadow-lg shadow-primary/20" asChild data-testid="button-login-header">
              <Link href="/login">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative pt-24 pb-20 px-6 overflow-hidden">
          <div className="max-w-5xl mx-auto text-center relative z-10">
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-[11px] font-black uppercase tracking-[0.2em] mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <Sparkles className="w-3.5 h-3.5" />
              The Future of Interviewing is Here
            </div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-8 leading-[1.1] animate-in fade-in slide-in-from-bottom-6 duration-1000">
              Interview like a <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent italic">Subject Matter Expert</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto font-medium leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
              Candiq.AI transforms your HR team into technical powerhouses. 
              Generate high-signal questions, get real-time AI guidance, and export professional reports in seconds.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-300">
              <Button size="lg" className="rounded-2xl h-16 px-10 text-lg font-black shadow-2xl shadow-primary/30 gap-3 group transition-all hover:scale-[1.03] active:scale-[0.97]" asChild data-testid="button-get-started">
                <Link href="/login">
                  Start Your Free Project
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform stroke-[3]" />
                </Link>
              </Button>
              <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-muted/30 border border-border/40 backdrop-blur-sm">
                <div className="flex -space-x-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-6 w-6 rounded-full border-2 border-background bg-muted overflow-hidden flex items-center justify-center">
                      <User className="w-3 h-3 text-muted-foreground" />
                    </div>
                  ))}
                </div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Join 500+ HR Teams</p>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-24 px-6 relative">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-4">Powerful Features for Modern Hiring</h2>
              <p className="text-muted-foreground text-lg font-medium max-w-2xl mx-auto">Everything you need to run high-quality interviews for technical and non-technical roles.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: Brain,
                  title: "Smart Question Engine",
                  desc: "Upload a JD and our AI extracts core competencies to build a custom-tailored interview rubric with 10-15 deep-probing questions.",
                  color: "bg-blue-500/10 text-blue-600 border-blue-500/20"
                },
                {
                  icon: Zap,
                  title: "Live AI Copilot",
                  desc: "Get real-time transcription and follow-up suggestions as the candidate speaks. AI identifies 'Good' and 'Poor' signals instantly.",
                  color: "bg-primary/10 text-primary border-primary/20"
                },
                {
                  icon: ClipboardList,
                  title: "Executive Reports",
                  desc: "Generate professional 'Hire/No-Hire' reports with direct transcript evidence and competency-based scoring matrices.",
                  color: "bg-green-500/10 text-green-600 border-green-500/20"
                }
              ].map((feature, i) => (
                <Card key={i} className="rounded-[2.5rem] border-border/40 bg-card hover:bg-background transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 group">
                  <CardHeader className="p-8">
                    <div className={`w-14 h-14 rounded-2xl ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500 border`}>
                      <feature.icon className="w-7 h-7 stroke-[2.5]" />
                    </div>
                    <CardTitle className="text-2xl font-black tracking-tight mb-4">{feature.title}</CardTitle>
                    <CardDescription className="text-base font-medium leading-relaxed leading-relaxed">{feature.desc}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits Checklist */}
        <section className="py-24 px-6 bg-muted/30 border-y border-border/40">
          <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl font-black tracking-tight mb-8 leading-tight">Built for <span className="text-primary">Non-Technical</span> Talent Partners</h2>
              <p className="text-lg font-medium text-muted-foreground mb-10 leading-relaxed">
                Interview any role—from React Architects to CFOs—with the confidence of a subject matter expert. Candiq handles the heavy lifting so you can focus on the human connection.
              </p>
              <div className="grid gap-4">
                {[
                  "No bots join your meeting - completely silent",
                  "Real-time transcription with speaker labels",
                  "Privacy-first: No raw audio is ever stored",
                  "Works with Zoom, Teams, Google Meet, and more"
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="h-6 w-6 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                      <CheckCircle className="w-3.5 h-3.5 text-green-600 stroke-[3]" />
                    </div>
                    <span className="font-bold text-foreground/80 tracking-tight">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-primary/10 rounded-[3rem] blur-3xl -z-10 animate-pulse" />
              <Card className="rounded-[3rem] border-border/40 shadow-2xl overflow-hidden bg-background p-2 group hover:scale-[1.02] transition-transform duration-700">
                <div className="aspect-[4/3] rounded-[2.5rem] bg-muted overflow-hidden flex items-center justify-center border border-border/40">
                  <div className="flex flex-col items-center gap-4 opacity-40">
                    <Brain className="w-16 h-16 text-muted-foreground" />
                    <p className="text-sm font-black uppercase tracking-widest italic">Live Interface Preview</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-32 px-6 relative overflow-hidden">
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-8">
              Ready to Interview Like an <span className="text-primary italic">Expert?</span>
            </h2>
            <p className="text-xl font-medium text-muted-foreground mb-12">
              Join hundreds of talent acquisition leaders using Candiq.AI. 
              <br className="hidden md:block" /> Start your first project for free today.
            </p>
            <Button size="lg" className="rounded-2xl h-16 px-12 text-lg font-black shadow-2xl shadow-primary/30 gap-3 group transition-all hover:scale-[1.05] active:scale-[0.95]" asChild data-testid="button-cta-bottom">
              <Link href="/login">
                Get Started Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform stroke-[3]" />
              </Link>
            </Button>
            <p className="text-sm font-bold text-muted-foreground/60 uppercase tracking-widest mt-8">No credit card required • Instant access</p>
          </div>
          
          <div className="absolute -bottom-48 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-primary/5 rounded-full blur-[120px] -z-10" />
        </section>
      </main>

      <footer className="border-t border-border/40 py-12 px-6 bg-card/30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-primary" />
            </div>
            <span className="font-black tracking-tight text-foreground/80">Candiq.AI</span>
          </div>
          <div className="flex items-center gap-8">
            <a href="#" className="text-sm font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest">Privacy Policy</a>
            <a href="#" className="text-sm font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest">Terms of Service</a>
            <a href="#" className="text-sm font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest">Support</a>
          </div>
          <p className="text-sm font-bold text-muted-foreground/40 uppercase tracking-widest">
            &copy; {new Date().getFullYear()} Candiq.AI
          </p>
        </div>
      </footer>
    </div>
  );
}
