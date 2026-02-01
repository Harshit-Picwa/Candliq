import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Home, Compass } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/[0.03] rounded-full blur-[120px]" />
      </div>

      <div className="text-center max-w-md animate-in fade-in zoom-in duration-700">
        <div className="h-24 w-24 rounded-[2rem] bg-primary/10 flex items-center justify-center mx-auto mb-8 shadow-inner">
          <Compass className="h-12 w-12 text-primary stroke-[1.5]" />
        </div>
        <h1 className="text-8xl font-black tracking-tighter text-foreground/10 mb-2">404</h1>
        <h2 className="text-3xl font-black tracking-tight mb-4">Lost in Transit</h2>
        <p className="text-muted-foreground font-medium mb-10 leading-relaxed text-lg">
          The page you're looking for has been moved or doesn't exist in our current dimension.
        </p>
        <Button size="lg" className="rounded-2xl px-10 font-bold shadow-xl shadow-primary/20 gap-2 h-14 transition-all hover:scale-105 active:scale-95" asChild>
          <Link href="/">
            <Home className="w-5 h-5 stroke-[2.5]" />
            Return to Base
          </Link>
        </Button>
      </div>
    </div>
  );
}
