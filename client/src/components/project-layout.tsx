import { ReactNode } from "react";
import { Header } from "./header";
import { DesktopOnlyGuard } from "./desktop-only-guard";
import { StageProgressBar } from "./stage-progress-bar";
import { Button } from "./ui/button";
import { MapPin, Calendar, Clock, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import type { Project } from "@shared/schema";
import { Skeleton } from "./ui/skeleton";

interface ProjectLayoutProps {
    children: ReactNode;
    project?: Project;
    isLoading?: boolean;
    currentStage: 1 | 2 | 3;
    stageDescription: string;
    onStageClick: (stage: 1 | 2 | 3) => void;
    clickableStages?: (1 | 2 | 3)[];
    actions?: ReactNode;
    subNavigation?: ReactNode;
    questionCount?: number;
}

export function ProjectLayout({
    children,
    project,
    isLoading,
    currentStage,
    stageDescription,
    onStageClick,
    clickableStages,
    actions,
    subNavigation,
    questionCount
}: ProjectLayoutProps) {
    if (isLoading) {
        return (
            <DesktopOnlyGuard>
                <div className="min-h-screen page-gradient">
                    <Header />
                    <main className="max-w-6xl mx-auto px-8 py-12">
                        <div className="flex items-center gap-4 mb-8">
                            <Skeleton className="h-10 w-10 rounded-full" />
                            <div className="flex-1">
                                <Skeleton className="h-8 w-64 mb-2" />
                                <Skeleton className="h-4 w-48" />
                            </div>
                        </div>
                        <div className="mb-6 max-w-4xl mx-auto">
                            <Skeleton className="h-24 w-full rounded-2xl" />
                        </div>
                        <Skeleton className="h-4 w-64 mx-auto mb-12" />
                        <Skeleton className="h-[400px] w-full rounded-2xl" />
                    </main>
                </div>
            </DesktopOnlyGuard>
        );
    }

    return (
        <DesktopOnlyGuard>
            <div className="min-h-screen page-gradient relative overflow-hidden">
                {/* Decorative Grid Pattern */}
                <div className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none"
                    style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }} />

                <Header />

                <main className="relative z-10 max-w-6xl mx-auto px-8 py-12 transition-all duration-300">
                    {/* Project Title and Header Actions */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                        <div className="flex items-center gap-4">
                            <div className="flex-1">
                                <motion.h1
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="text-3xl font-black tracking-tight text-foreground/90 bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent"
                                >
                                    {project?.title || "New Project"}
                                </motion.h1>
                                {project && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.1 }}
                                        className="flex flex-wrap items-center gap-3 mt-2 text-muted-foreground text-xs font-bold uppercase tracking-wider"
                                    >
                                        {(project.locationCity || project.locationState || project.locationCountry) && (
                                            <div className="flex items-center gap-2 bg-primary/5 px-2.5 py-1 rounded-lg border border-primary/10 text-primary/80">
                                                <MapPin className="w-3.5 h-3.5" />
                                                <span>
                                                    {[project.locationCity, project.locationState, project.locationCountry].filter(Boolean).join(", ")}
                                                </span>
                                            </div>
                                        )}
                                        {project.createdAt && (
                                            <div className="flex items-center gap-2 bg-muted/40 px-2.5 py-1 rounded-lg border border-border/40">
                                                <Calendar className="w-3.5 h-3.5 text-muted-foreground/60" />
                                                <span>{format(new Date(project.createdAt), "MMM d, yyyy")}</span>
                                            </div>
                                        )}
                                        {(() => {
                                            const totalMins = project.totalMinutes ?? (project as { total_minutes?: number }).total_minutes;
                                            const screeningMins = project.interviewDuration ?? (project as { interview_duration?: number }).interview_duration;
                                            return (
                                                <>
                                                    {totalMins != null && (
                                                        <div className="flex items-center gap-2 bg-muted/40 px-2.5 py-1 rounded-lg border border-border/40">
                                                            <Clock className="w-3.5 h-3.5 text-muted-foreground/60" />
                                                            <span>{totalMins} min total</span>
                                                        </div>
                                                    )}
                                                    {screeningMins != null && (
                                                        <div className="flex items-center gap-2 bg-muted/40 px-2.5 py-1 rounded-lg border border-border/40">
                                                            <MessageSquare className="w-3.5 h-3.5 text-muted-foreground/60" />
                                                            <span>{screeningMins} min screening</span>
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </motion.div>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-3 self-end md:self-center">
                            {actions}
                        </div>
                    </div>

                    {/* Three-stage progress bar */}
                    <div className="mb-6 max-w-4xl mx-auto">
                        <StageProgressBar
                            currentStage={currentStage}
                            onStageClick={onStageClick}
                            clickableStages={clickableStages}
                            questionCount={questionCount}
                        />
                    </div>

                    {/* Consistent Stage Description Height Area */}
                    <div className="flex items-center justify-center mb-6 h-6">
                        <p className="text-xs font-medium text-muted-foreground">{stageDescription}</p>
                    </div>

                    {/* Sub-navigation Slot */}
                    {subNavigation && (
                        <div className="flex items-center justify-center mb-12">
                            {subNavigation}
                        </div>
                    )}

                    {/* Main Content with Transition */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={`${currentStage}-${subNavigation ? 'subnav' : 'main'}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>
        </DesktopOnlyGuard>
    );
}
