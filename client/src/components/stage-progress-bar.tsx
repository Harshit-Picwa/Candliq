import { Progress } from "@/components/ui/progress";
import { FileText, Edit, Rocket, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = [
  {
    stage: 1 as const,
    label: "JD & SME Notes",
    sublabel: "Create questions",
    icon: FileText,
  },
  {
    stage: 2 as const,
    label: "Refine & Review",
    sublabel: "Approve questions",
    icon: Edit,
  },
  {
    stage: 3 as const,
    label: "Ready",
    sublabel: "For interview",
    icon: Rocket,
  },
] as const;

type CurrentStage = 1 | 2 | 3;

interface StageProgressBarProps {
  currentStage: CurrentStage;
  className?: string;
  /** When provided, stages become clickable. Called with target stage. */
  onStageClick?: (stage: CurrentStage) => void;
  /** Stages that can be navigated to (e.g. [3] = only Ready is clickable when approved) */
  clickableStages?: CurrentStage[];
}

/**
 * Three-stage progress bar for the hiring flow:
 * 1. JD & SME Notes → Create questions
 * 2. Refine & review → Approve questions
 * 3. Ready for interview
 */
export function StageProgressBar({ currentStage, className, onStageClick, clickableStages }: StageProgressBarProps) {
  const progressPercent = (currentStage / 3) * 100;

  return (
    <div className={cn("w-full", className)}>
      {/* Progress bar — compact */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground mb-1">
          <span>Setup progress</span>
          <span>{Math.round(progressPercent)}% complete</span>
        </div>
        <Progress value={progressPercent} className="h-1.5 rounded-full" />
      </div>

      {/* Stage pills — compact */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {STAGES.map(({ stage, label, sublabel, icon: Icon }, i) => {
          const isComplete = currentStage > stage;
          const isCurrent = currentStage === stage;
          const isClickable = onStageClick && (!clickableStages || clickableStages.includes(stage));
          return (
            <div key={stage} className="flex items-center flex-1 min-w-0">
              <div
                role={isClickable ? "button" : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onClick={isClickable ? () => onStageClick(stage) : undefined}
                onKeyDown={isClickable ? (e) => e.key === "Enter" && onStageClick(stage) : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2 py-1.5 sm:px-3 sm:py-2 border transition-all min-w-0 flex-1",
                  isComplete &&
                    "bg-primary/5 border-primary/20 text-primary",
                  isCurrent &&
                    "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20",
                  !isComplete &&
                    !isCurrent &&
                    "bg-muted/30 border-border/50 text-muted-foreground",
                  isClickable && "cursor-pointer hover:opacity-90"
                )}
              >
                <div
                  className={cn(
                    "flex h-5 w-5 sm:h-6 sm:w-6 shrink-0 items-center justify-center rounded-md",
                    isComplete && "bg-primary/20 text-primary",
                    isCurrent && "bg-primary-foreground/20",
                    !isComplete && !isCurrent && "bg-muted text-muted-foreground"
                  )}
                >
                  {isComplete ? (
                    <CheckCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  ) : (
                    <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  )}
                </div>
                <div className="min-w-0 hidden sm:block">
                  <p
                    className={cn(
                      "font-semibold text-[10px] sm:text-xs truncate leading-tight",
                      isCurrent && "text-primary-foreground"
                    )}
                  >
                    {label}
                  </p>
                  <p
                    className={cn(
                      "text-[9px] sm:text-[10px] truncate leading-tight",
                      isCurrent ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}
                  >
                    {sublabel}
                  </p>
                </div>
              </div>
              {i < STAGES.length - 1 && (
                <div className="hidden sm:block w-2 h-px bg-border shrink-0 mx-0.5" aria-hidden />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
