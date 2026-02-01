import { Link, useLocation } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import { Briefcase, LogOut, User, LayoutDashboard, ChevronDown } from "lucide-react";

export function Header() {
  const { user, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    const first = firstName?.charAt(0) || "";
    const last = lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || "U";
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between gap-4 px-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 group transition-all">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">
              <Briefcase className="w-4.5 h-4.5 text-primary-foreground stroke-[2.5]" />
            </div>
            <span className="text-xl font-black tracking-tighter bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Candiq.AI
            </span>
          </Link>
          
          {isAuthenticated && (
            <nav className="hidden md:flex items-center gap-2">
              <Link href="/dashboard">
                <Button 
                  variant="ghost"
                  size="sm"
                  className={`rounded-lg font-bold transition-all px-4 ${
                    location === "/dashboard" 
                      ? "bg-primary/5 text-primary hover:bg-primary/10" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="link-dashboard"
                >
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Workspace
                </Button>
              </Link>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          
          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-10 px-2 rounded-xl hover:bg-muted/60 transition-all gap-2 border border-transparent hover:border-border/40" data-testid="button-user-menu">
                  <Avatar className="h-7 w-7 border border-border/40 shadow-sm">
                    <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
                    <AvatarFallback className="text-[10px] font-black bg-primary/10 text-primary">{getInitials(user?.firstName, user?.lastName)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-bold text-foreground/80 hidden sm:inline-block">{user?.firstName || "Account"}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64 rounded-2xl border-border/40 shadow-2xl p-2" align="end" forceMount>
                <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl mb-2">
                  <Avatar className="h-10 w-10 border border-border/40 shadow-sm">
                    <AvatarImage src={user?.profileImageUrl || undefined} />
                    <AvatarFallback className="font-black bg-primary text-white">{getInitials(user?.firstName, user?.lastName)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <p className="text-sm font-black tracking-tight truncate">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">{user?.email}</p>
                  </div>
                </div>
                <DropdownMenuSeparator className="mx-1 my-1" />
                <DropdownMenuItem 
                  onClick={() => logout()}
                  className="flex items-center gap-3 p-3 rounded-lg cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/5 font-bold transition-all" 
                  data-testid="button-logout"
                >
                  <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <LogOut className="h-4 w-4" />
                  </div>
                  Log Out Session
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button className="rounded-xl font-bold px-6 shadow-md shadow-primary/10" asChild data-testid="button-login">
              <Link href="/login">Get Started</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
