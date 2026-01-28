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
      console.log("[auth/user] req.cookies:", JSON.stringify(req.cookies));
      console.log("[auth/user] req.session:", req.session ? "exists" : "missing");
      if (req.session) {
        console.log("[auth/user] req.session.passport:", JSON.stringify(req.session.passport));
        console.log("[auth/user] req.session.passport?.user:", req.session.passport?.user);
      }
      
      // Check if user is authenticated
      if (!req.isAuthenticated() || !req.user || !req.user.id) {
        console.log("[auth/user] User not authenticated, returning 401");
        console.log("[auth/user] Debug - isAuthenticated:", req.isAuthenticated());
        console.log("[auth/user] Debug - req.user:", req.user);
        console.log("[auth/user] Debug - req.user?.id:", req.user?.id);
        console.log("[auth/user] Debug - session.passport:", req.session?.passport);
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
  // Also clears all sessions from database if CLEAR_ALL_SESSIONS=true is in query
  app.get("/api/auth/clear-session", async (req: any, res) => {
    // If ?clearAll=true, clear all sessions from database
    if (req.query.clearAll === "true") {
      try {
        const { db } = await import("../db");
        const result = await db.session.deleteMany({});
        console.log(`[auth] Cleared all sessions from database. Deleted ${result.count} session(s)`);
      } catch (error) {
        console.error("[auth] Error clearing all sessions:", error);
      }
    }
    
    req.logout((err: any) => {
      if (err) {
        console.error("[auth] Error during force logout:", err);
      }
      req.session.destroy((destroyErr: any) => {
        if (destroyErr) {
          console.error("[auth] Error destroying session:", destroyErr);
        }
        res.clearCookie("connect.sid", { path: "/", httpOnly: true, secure: false });
        res.redirect("/login");
      });
    });
  });

  // Endpoint to remove dev users (for cleanup)
  // DELETE /api/auth/remove-dev-users?email=dev@localhost
  app.delete("/api/auth/remove-dev-users", async (req: any, res) => {
    try {
      const { db } = await import("../db");
      const email = req.query.email || "dev@localhost";
      
      const deletedUsers = await db.user.deleteMany({
        where: {
          email: email,
        },
      });
      
      console.log(`[auth] Removed ${deletedUsers.count} dev user(s) with email: ${email}`);
      res.json({ 
        success: true, 
        message: `Removed ${deletedUsers.count} user(s) with email ${email}`,
        count: deletedUsers.count 
      });
    } catch (error: any) {
      console.error("[auth] Error removing dev users:", error);
      res.status(500).json({ error: "Failed to remove dev users", details: error?.message });
    }
  });
}
