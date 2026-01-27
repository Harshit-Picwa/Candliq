import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./auth";

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user (returns null if not authenticated)
  app.get("/api/auth/user", async (req: any, res) => {
    try {
      console.log("[auth/user] Checking authentication...");
      console.log("[auth/user] req.isAuthenticated():", req.isAuthenticated());
      console.log("[auth/user] req.user:", req.user);
      console.log("[auth/user] req.sessionID:", req.sessionID);
      
      // Check if user is authenticated
      if (!req.isAuthenticated() || !req.user || !req.user.id) {
        console.log("[auth/user] User not authenticated, returning 401");
        return res.status(401).json(null);
      }
      
      console.log("[auth/user] User appears authenticated, fetching from database...");
      console.log("[auth/user] req.user.id:", req.user?.id);
      const userId = req.user.id;
      const user = await authStorage.getUser(userId);
      
      if (!user) {
        console.log("[auth/user] User not found in database, invalidating session");
        // User doesn't exist in database, destroy session
        req.logout((err: any) => {
          if (err) console.error("[auth/user] Error logging out:", err);
        });
        return res.status(401).json(null);
      }
      
      console.log("[auth/user] User found, returning user data");
      // Don't send password hash
      const { passwordHash, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("[auth/user] Error fetching user:", error);
      res.status(401).json(null);
    }
  });

  // Debug endpoint to check session state
  app.get("/api/auth/debug", async (req: any, res) => {
    res.json({
      isAuthenticated: req.isAuthenticated(),
      user: req.user,
      session: req.session ? "exists" : "missing",
      cookies: req.cookies,
      sessionID: req.sessionID,
    });
  });
  
  // Force logout endpoint (for debugging)
  app.post("/api/auth/force-logout", async (req: any, res) => {
    req.logout((err: any) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      req.session.destroy((destroyErr: any) => {
        if (destroyErr) {
          return res.status(500).json({ error: "Failed to destroy session" });
        }
        res.clearCookie("connect.sid");
        res.json({ success: true, message: "Logged out successfully" });
      });
    });
  });
  
  // GET endpoint to force logout and redirect (easier for testing)
  app.get("/api/auth/clear-session", async (req: any, res) => {
    req.logout((err: any) => {
      if (err) {
        console.error("[auth] Error during force logout:", err);
      }
      req.session.destroy((destroyErr: any) => {
        if (destroyErr) {
          console.error("[auth] Error destroying session:", destroyErr);
        }
        res.clearCookie("connect.sid", { path: "/" });
        res.redirect("/login");
      });
    });
  });
}
