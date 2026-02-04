import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileText, Edit, Rocket, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const STAGES = [
  {
    stage: 1 as const,
    label: "JD & SME Notes",
    sublabel: "Create questions",
    icon: FileText,
  },
  {
    stage: 2 as const,
    label: "Questions",
    sublabel: "Refine criteria",
    icon: Edit,
  },
  {
    stage: 3 as const,
    label: "Ready",
    sublabel: "Scale hiring",
    icon: Rocket,
  },
] as const;

type CurrentStage = 1 | 2 | 3;

interface StageProgressBarProps {
  currentStage: CurrentStage;
  className?: string;
  onStageClick?: (stage: CurrentStage) => void;
  clickableStages?: CurrentStage[];
  questionCount?: number;
  disabledStageTooltips?: Partial<Record<CurrentStage, string>>;
}

export function StageProgressBar({ currentStage, className, onStageClick, clickableStages, questionCount, disabledStageTooltips }: StageProgressBarProps) {
  const progressPercent = (currentStage / 3) * 100;

  return (
    <div className={cn("w-full max-w-4xl mx-auto", className)}>
      <div className="mb-6">
        <div className="relative h-2 w-full bg-muted/40 rounded-full overflow-hidden border border-border/20 shadow-inner">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 1, ease: "circOut" }}
            className="absolute h-full bg-gradient-to-r from-primary/80 via-primary to-primary shadow-[0_0_15px_rgba(var(--primary),0.3)] rounded-full"
          />
        </div>
      </div>

      <TooltipProvider>
        <div className="flex items-center gap-2 sm:gap-4">
          {STAGES.map(({ stage, label, sublabel, icon: Icon }, i) => {
            const isComplete = currentStage > stage;
            const isCurrent = currentStage === stage;
            const isClickable = onStageClick && (!clickableStages || clickableStages.includes(stage));
            const disabledTooltip = !isClickable && disabledStageTooltips?.[stage];

            const pill = (
              <motion.div
                whileHover={isClickable ? { scale: 1.02 } : {}}
                whileTap={isClickable ? { scale: 0.98 } : {}}
                className={cn(
                  "relative flex items-center gap-2 sm:gap-3 rounded-2xl px-3 py-2 sm:px-5 sm:py-3 border transition-all min-w-0 flex-1 overflow-hidden",
                  isComplete && "bg-primary/[0.03] border-primary/20 text-primary shadow-sm",
                  isCurrent && "bg-primary text-primary-foreground border-primary shadow-xl shadow-primary/20",
                  !isComplete && !isCurrent && "bg-muted/30 border-border/50 text-muted-foreground/60",
                  isClickable && "cursor-pointer group/pill"
                )}
                role={isClickable ? "button" : undefined}
                onClick={isClickable ? () => onStageClick(stage) : undefined}
              >
                {isCurrent && (
                  <motion.div
                    layoutId="current-glow"
                    className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 skew-x-12 translate-x-[-100%]"
                    animate={{ translateX: ["100%", "-100%"] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  />
                )}

                <div
                  className={cn(
                    "flex h-6 w-6 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl transition-colors shadow-sm",
                    isComplete && "bg-primary/10 text-primary",
                    isCurrent && "bg-primary-foreground/10 text-white",
                    !isComplete && !isCurrent && "bg-muted text-muted-foreground/40"
                  )}
                >
                  {isComplete ? (
                    <CheckCircle className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                  ) : (
                    <Icon className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "font-black text-[10px] sm:text-[11px] uppercase tracking-widest truncate leading-tight",
                      isCurrent ? "text-white" : isComplete ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {label}
                  </p>
                  <p
                    className={cn(
                      "text-[9px] sm:text-[10px] font-bold truncate leading-tight mt-0.5",
                      isCurrent ? "text-white/70" : "text-muted-foreground/60"
                    )}
                  >
                    {sublabel}
                  </p>
                </div>
              </motion.div>
            );

            return (
              <div key={stage} className="flex items-center flex-1 min-w-0">
                {disabledTooltip ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex flex-1 min-w-0 opacity-50 grayscale-[0.5]">{pill}</span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="font-bold rounded-lg border-border/40 shadow-xl">
                      {disabledTooltip}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  pill
                )}
                {i < STAGES.length - 1 && (
                  <div className="hidden lg:block w-px h-6 bg-border/20 mx-2" aria-hidden />
                )}
              </div>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}
