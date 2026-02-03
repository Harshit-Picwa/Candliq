"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  "Analyzing job description...",
  "Extracting key competencies...",
  "Generating screening questions...",
  "Building evaluation rubrics...",
  "Almost there...",
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

  return (
    <Card
      className={cn(
        "rounded-[2.5rem] border-border/40 shadow-xl shadow-primary/5 overflow-hidden bg-card/50 backdrop-blur-sm max-w-xl mx-auto",
        className
      )}
    >
      <CardContent className="p-10">
        <div className="flex flex-col items-center text-center">
          {/* Icon */}
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <Brain className="w-7 h-7 text-primary" />
          </div>

          {/* Dynamic step name */}
          <h3 className="text-xl font-black tracking-tight text-foreground mb-1.5">
            {currentStep}
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            This usually takes about {ESTIMATED_SECONDS} seconds.
          </p>

          {/* Progress bar */}
          <div className="w-full mb-2">
            <Progress value={progressPercent} className="h-2 rounded-full" />
          </div>

          {/* Percentage and time remaining */}
          <div className="flex justify-between w-full text-sm text-muted-foreground mb-6">
            <span>{Math.round(progressPercent)}% complete</span>
            <span>~{remaining}s remaining</span>
          </div>

          {/* Working on it indicator */}
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </span>
            Working on it
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
