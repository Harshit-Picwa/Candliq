
import { Link } from "wouter";
import { Check, Settings, FileText, Users, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectWorkflowProps {
  currentStep: "setup" | "questions" | "interviews";
  projectId: string;
  className?: string;
}

export function ProjectWorkflow({ currentStep, projectId, className }: ProjectWorkflowProps) {
  const steps = [
    {
      id: "setup",
      label: "Project Setup",
      description: "Define role & criteria",
      href: `/projects/${projectId}`,
      icon: Settings
    },
    {
      id: "questions",
      label: "Question Engine",
      description: "Review AI generation",
      href: `/projects/${projectId}/questions`,
      icon: FileText
    },
    {
      id: "interviews",
      label: "Interview Cockpit",
      description: "Conduct & evaluate",
      href: `/projects/${projectId}/interviews`,
      icon: Users
    }
  ] as const;

  const currentIdx = steps.findIndex(s => s.id === currentStep);

  return (
    <div className={cn("w-full mb-8", className)}>
      <div className="relative">
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-border -z-10 -translate-y-1/2 hidden md:block" />
        <div className="flex flex-col md:flex-row justify-between gap-4 md:gap-0">
          {steps.map((step, idx) => {
            const isCompleted = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            const Icon = step.icon;

            return (
              <Link key={step.id} href={step.href}>
                <div 
                  className={cn(
                    "group flex items-center gap-3 p-2 pr-4 rounded-xl transition-all duration-200 cursor-pointer bg-background border md:border-0",
                    isCurrent 
                      ? "ring-2 ring-primary border-primary shadow-sm md:ring-0 md:bg-transparent" 
                      : "hover:bg-muted/50 border-border"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors shrink-0",
                    isCompleted 
                      ? "bg-primary border-primary text-primary-foreground" 
                      : isCurrent 
                        ? "bg-background border-primary text-primary" 
                        : "bg-muted border-muted-foreground/30 text-muted-foreground group-hover:border-primary/50 group-hover:text-foreground"
                  )}>
                    {isCompleted ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className={cn(
                      "text-sm font-semibold leading-none mb-1",
                      isCurrent ? "text-primary" : "text-foreground group-hover:text-primary transition-colors"
                    )}>
                      {step.label}
                    </span>
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      {step.description}
                    </span>
                  </div>
                  
                  {/* Mobile-only arrow */}
                  <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground md:hidden" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
