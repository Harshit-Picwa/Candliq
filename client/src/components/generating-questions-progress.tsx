"use client";

import * as React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Brain, FileSearch, ListChecks, Target, Sparkles, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const STEPS = [
  { text: "Analyzing job description", icon: FileSearch },
  { text: "Extracting key competencies", icon: Brain },
  { text: "Generating screening questions", icon: ListChecks },
  { text: "Building evaluation rubrics", icon: Target },
  { text: "Finalizing your interview kit", icon: Rocket },
];

const ESTIMATED_SECONDS = 45;

interface GeneratingQuestionsProgressProps {
  className?: string;
}

export function GeneratingQuestionsProgress({ className }: GeneratingQuestionsProgressProps) {
  const [elapsed, setElapsed] = React.useState(0);
  const startRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    startRef.current = Date.now();
    const interval = setInterval(() => {
      if (startRef.current === null) return;
      const sec = Math.floor((Date.now() - startRef.current) / 1000);
      setElapsed(sec);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const progressPercent = Math.min(95, (elapsed / ESTIMATED_SECONDS) * 100);
  const stepIndex = Math.min(
    STEPS.length - 1,
    Math.floor((elapsed / ESTIMATED_SECONDS) * STEPS.length)
  );
  const currentStep = STEPS[stepIndex];
  const remaining = Math.max(0, ESTIMATED_SECONDS - elapsed);
  const StepIcon = currentStep.icon;

  return (
    <Card
      className={cn(
        "rounded-[2.5rem] border-border/40 shadow-2xl shadow-primary/5 overflow-hidden bg-card/40 backdrop-blur-xl ring-1 ring-white/5",
        className
      )}
    >
      <CardHeader className="p-10 pb-6 relative overflow-hidden">
        <div className="flex items-center gap-4 mb-3">
          <motion.div 
            className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shadow-inner ring-1 ring-primary/20"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Brain className="w-6 h-6 text-primary" />
          </motion.div>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-foreground">
              Generating Questions
            </h2>
            <p className="text-sm text-muted-foreground">
              Building your interview screening kit
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-10 pt-0">
        {/* Main loading area */}
        <div className="flex flex-col items-center justify-center py-16">
          
          {/* Animated icon */}
          <div className="relative mb-8">
            <motion.div 
              className="absolute inset-0 rounded-full bg-primary/20 blur-xl"
              animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div 
              className="relative h-24 w-24 rounded-2xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/25"
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={stepIndex}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <StepIcon className="w-12 h-12 text-white" strokeWidth={1.5} />
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </div>

          {/* Step text */}
          <AnimatePresence mode="wait">
            <motion.h3 
              key={currentStep.text}
              className="text-xl font-bold text-foreground mb-2 text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {currentStep.text}...
            </motion.h3>
          </AnimatePresence>
          
          <p className="text-sm text-muted-foreground mb-8 text-center max-w-md">
            Our AI is creating targeted screening questions with detailed evaluation rubrics tailored to your job requirements.
          </p>

          {/* Progress bar */}
          <div className="w-full max-w-md mb-4">
            <div className="relative h-2.5 rounded-full bg-muted/50 overflow-hidden">
              <motion.div 
                className="h-full rounded-full bg-gradient-to-r from-primary to-blue-500"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
              {/* Shimmer effect */}
              <motion.div 
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="flex justify-between w-full max-w-md text-sm mb-8">
            <span className="font-bold text-foreground">{Math.round(progressPercent)}% complete</span>
            <span className="text-muted-foreground">~{remaining}s remaining</span>
          </div>

          {/* Step indicators */}
          <div className="flex items-center gap-3 mb-8">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={i}
                  className={cn(
                    "flex items-center justify-center rounded-xl transition-all duration-300",
                    i <= stepIndex 
                      ? "w-10 h-10 bg-primary shadow-md shadow-primary/20" 
                      : "w-8 h-8 bg-muted/30 border border-border/40"
                  )}
                  animate={i === stepIndex ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <Icon className={cn(
                    i <= stepIndex 
                      ? "w-5 h-5 text-white" 
                      : "w-4 h-4 text-muted-foreground/50"
                  )} />
                </motion.div>
              );
            })}
          </div>

          {/* Working indicator */}
          <div className="flex items-center gap-3 px-6 py-3 rounded-full bg-primary/10 border border-primary/20">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <Brain className="w-5 h-5 text-primary" />
            </motion.div>
            <span className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-2 w-2 rounded-full bg-primary"
                  animate={{ 
                    scale: [1, 1.4, 1],
                    opacity: [0.5, 1, 0.5]
                  }}
                  transition={{ 
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.2
                  }}
                />
              ))}
            </span>
            <span className="text-sm font-semibold text-primary">
              AI is building your interview kit
            </span>
            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
