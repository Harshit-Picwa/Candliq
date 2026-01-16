import { Monitor } from "lucide-react";

export function DesktopOnlyGuard({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="hidden lg:contents">
        {children}
      </div>
      <div className="flex lg:hidden min-h-screen items-center justify-center bg-background p-8">
        <div className="text-center max-w-md">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Monitor className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold mb-3">Desktop Required</h1>
          <p className="text-muted-foreground">
            Candiq.AI is designed for desktop use to provide the best interview experience. 
            Please use a laptop or desktop computer with a screen width of at least 1280px.
          </p>
        </div>
      </div>
    </>
  );
}
