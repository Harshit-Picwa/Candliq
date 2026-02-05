"use client";

import * as React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Sparkles, FileText, Zap, Wand2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const STEPS = [
    { text: "Analyzing provided content", icon: FileText },
    { text: "Identifying key requirements", icon: Zap },
    { text: "Extracting responsibilities", icon: Wand2 },
    { text: "Refining job description", icon: Sparkles },
    { text: "Finalizing content", icon: CheckCircle2 },
];

const ESTIMATED_SECONDS = 15;

interface RefiningJDProgressProps {
    className?: string;
}

export function RefiningJDProgress({ className }: RefiningJDProgressProps) {
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
                        <Sparkles className="w-6 h-6 text-primary" />
                    </motion.div>
                    <div>
                        <h2 className="text-2xl font-black tracking-tight text-foreground">
                            Refining with AI
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Cleaning up your job description
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
                            className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/25"
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
                                    <StepIcon className="w-10 h-10 text-white" strokeWidth={1.5} />
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
                        Our AI is extracting the most relevant requirements from your job description.
                    </p>

                    {/* Progress bar */}
                    <div className="w-full max-w-md mb-4">
                        <div className="relative h-2 rounded-full bg-muted/50 overflow-hidden">
                            <motion.div 
                                className="h-full rounded-full bg-primary"
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
                    <div className="flex justify-between w-full max-w-md text-sm text-muted-foreground mb-6">
                        <span className="font-medium">{Math.round(progressPercent)}% complete</span>
                        <span>~{remaining}s remaining</span>
                    </div>

                    {/* Step dots */}
                    <div className="flex items-center gap-2 mb-6">
                        {STEPS.map((_, i) => (
                            <motion.div
                                key={i}
                                className={cn(
                                    "h-2 rounded-full transition-all duration-300",
                                    i <= stepIndex 
                                        ? "bg-primary w-6" 
                                        : "bg-muted/50 w-2"
                                )}
                            />
                        ))}
                    </div>

                    {/* Working indicator */}
                    <div className="flex items-center gap-3 px-5 py-2.5 rounded-full bg-primary/10 border border-primary/20">
                        <span className="flex gap-1">
                            {[0, 1, 2].map((i) => (
                                <motion.span
                                    key={i}
                                    className="h-2 w-2 rounded-full bg-primary"
                                    animate={{ 
                                        scale: [1, 1.3, 1],
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
                            AI is refining your content
                        </span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
