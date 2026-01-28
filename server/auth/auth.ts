import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcrypt";
import { authStorage } from "./storage";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const sessionSecret =
    process.env.SESSION_SECRET || "dev-session-secret-change-me";
  if (!process.env.SESSION_SECRET) {
    console.warn(
      "[auth] SESSION_SECRET not set. Using an insecure default for local use.",
    );
  }
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  const isProduction = process.env.NODE_ENV === "production";
  // Use HTTPS detection: secure cookies only if explicitly using HTTPS
  // For HTTP (like EC2 without SSL), we need secure: false
  const useSecureCookies = process.env.USE_SECURE_COOKIES === "true" || false;
  const cookieConfig: any = {
    httpOnly: true,
    secure: useSecureCookies, // Only true if explicitly enabled (requires HTTPS)
    maxAge: sessionTtl,
    path: "/",
    sameSite: useSecureCookies ? "none" : "lax", // 'lax' works with HTTP, 'none' requires HTTPS
  };
  
  return session({
    secret: sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    name: "connect.sid",
    cookie: cookieConfig,
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());
  
  // Clear all sessions on startup if CLEAR_SESSIONS_ON_START is set
  // This is useful for development to ensure users must log in again after server restart
  if (process.env.CLEAR_SESSIONS_ON_START === "true") {
    console.log("[auth] Clearing all sessions on startup (CLEAR_SESSIONS_ON_START=true)...");
    try {
      const { db } = await import("../db");
      const result = await db.session.deleteMany({});
      console.log(`[auth] All sessions cleared. Deleted ${result.count} session(s)`);
    } catch (error) {
      console.error("[auth] Error clearing sessions:", error);
      console.error("[auth] Make sure DATABASE_URL is set and the database is accessible");
    }
  }

  // NOTE: No automatic dev user is created. Users must sign up through the /api/signup endpoint.
  // If you see a dev user in your database, it was likely created manually or through signup.
  
  // Check for and log any existing dev users (for debugging)
  // Also check if any dev users are being created automatically
  let devUserCheckCount = 0;
  const checkForDevUser = async () => {
    try {
      const devUser = await authStorage.getUserByEmail("dev@localhost");
      if (devUser) {
        devUserCheckCount++;
        console.warn(`[auth] ⚠️  WARNING #${devUserCheckCount}: Found dev user (dev@localhost) in database.`);
        console.warn("[auth] This user was NOT created by the application code.");
        console.warn("[auth] Possible sources: database trigger, migration, external script, or manual insertion.");
        console.warn("[auth] To remove it, use: DELETE /api/auth/remove-dev-users?email=dev@localhost");
        
        // Auto-delete if configured
        if (process.env.AUTO_DELETE_DEV_USER === "true") {
          try {
            const { db } = await import("../db");
            await db.user.deleteMany({ where: { email: "dev@localhost" } });
            console.log("[auth] ✓ Auto-deleted dev@localhost user (AUTO_DELETE_DEV_USER=true)");
          } catch (error) {
            console.error("[auth] Error auto-deleting dev user:", error);
          }
        }
      } else if (devUserCheckCount === 0) {
        console.log("[auth] ✓ No dev@localhost user found (as expected)");
      }
    } catch (error) {
      // Ignore errors during this check
      if (devUserCheckCount === 0) {
        console.log("[auth] Could not check for dev user (this is OK if database is not yet initialized)");
      }
    }
  };
  
  // Check immediately
  await checkForDevUser();
  
  // Check periodically every 30 seconds to catch any automatic creation
  if (process.env.NODE_ENV === "development") {
    setInterval(checkForDevUser, 30000);
    console.log("[auth] 🔍 Monitoring for dev@localhost user creation (checking every 30 seconds)");
  }
  
  // Explicitly prevent any automatic user creation
  console.log("[auth] ✓ Automatic user creation is DISABLED. Users must sign up through /api/signup");
  
  // Middleware to validate and clear invalid sessions
  app.use(async (req: any, res, next) => {
    if (req.isAuthenticated() && req.user && req.user.id) {
      try {
        // Verify user still exists in database
        const user = await authStorage.getUser(req.user.id);
        if (!user) {
          console.log("[auth] User in session not found in database, clearing session");
          req.logout((err: any) => {
            if (err) console.error("[auth] Error clearing invalid session:", err);
          });
          req.user = undefined;
        }
      } catch (error) {
        console.error("[auth] Error validating session:", error);
        req.logout((err: any) => {
          if (err) console.error("[auth] Error clearing session on error:", err);
        });
        req.user = undefined;
      }
    }
    next();
  });

  // Configure passport-local strategy
  passport.use(
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      async (email, password, done) => {
        try {
          const user = await authStorage.getUserByEmail(email);
          if (!user) {
            return done(null, false, { message: "Invalid email or password" });
          }

          if (!user.passwordHash) {
            return done(null, false, { message: "Account not set up. Please sign up." });
          }

          const isValid = await bcrypt.compare(password, user.passwordHash);
          if (!isValid) {
            return done(null, false, { message: "Invalid email or password" });
          }

          // Return user in format expected by session
          return done(null, {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            profileImageUrl: user.profileImageUrl,
          });
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  passport.serializeUser((user: Express.User, cb) => {
    console.log("[serializeUser] Serializing user:", JSON.stringify(user));
    cb(null, user);
  });

  passport.deserializeUser(async (user: Express.User, cb) => {
    console.log("[deserializeUser] Deserializing user:", JSON.stringify(user));
    if (!user) {
      console.error("[deserializeUser] User is null or undefined");
      return cb(null, false);
    }
    if (!user.id) {
      console.error("[deserializeUser] User object missing id:", user);
      return cb(null, false);
    }
    
    // Verify user still exists in database
    try {
      const dbUser = await authStorage.getUser(user.id);
      if (!dbUser) {
        console.error("[deserializeUser] User not found in database, invalidating session");
        return cb(null, false);
      }
      console.log("[deserializeUser] Successfully deserialized user with id:", user.id);
      cb(null, user);
    } catch (error) {
      console.error("[deserializeUser] Error verifying user:", error);
      return cb(null, false);
    }
  });

  // Login endpoint
  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: Express.User, info: any) => {
      if (err) {
        return res.status(500).json({ error: "Authentication error", details: err.message });
      }
      if (!user) {
        return res.status(401).json({ error: info?.message || "Authentication failed" });
      }
      req.login(user, (loginErr) => {
        if (loginErr) {
          return res.status(500).json({ error: "Failed to create session" });
        }
        // Explicitly save the session to ensure it's persisted
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[login] Error saving session:", saveErr);
            return res.status(500).json({ error: "Failed to save session" });
          }
          console.log("[login] Session saved successfully for user:", user.id);
          return res.json({ success: true, user });
        });
      });
    })(req, res, next);
  });

  // Signup endpoint
  app.post("/api/signup", async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      // Prevent creation of dev@localhost user
      if (email === "dev@localhost" || email?.toLowerCase() === "dev@localhost") {
        console.warn("[auth] Attempt to create dev@localhost user blocked");
        return res.status(400).json({ error: "Cannot create dev@localhost user. This email is reserved." });
      }

      // Check if user already exists
      const existingUser = await authStorage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      console.log(`[auth] Creating new user: ${email}`);
      const user = await authStorage.createUser({
        email,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        profileImageUrl: null,
      });
      console.log(`[auth] User created successfully: ${user.id} (${email})`);

      // Auto-login after signup
      req.login(
        {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
        },
        (err) => {
          if (err) {
            console.error("[signup] Error during login:", err);
            return res.status(500).json({ error: "Account created but failed to log in" });
          }
          // Explicitly save the session to ensure it's persisted
          req.session.save((saveErr) => {
            if (saveErr) {
              console.error("[signup] Error saving session:", saveErr);
              return res.status(500).json({ error: "Account created but failed to save session" });
            }
            console.log("[signup] Session saved successfully for user:", user.id);
            return res.json({ success: true, user });
          });
        }
      );
    } catch (error: any) {
      console.error("Signup error:", error);
      res.status(500).json({ error: "Failed to create account", details: error?.message });
    }
  });

  app.get("/api/callback", (req, res) => {
    res.redirect("/");
  });

  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      req.session.destroy((destroyErr) => {
        if (destroyErr) {
          return res.status(500).json({ error: "Failed to destroy session" });
        }
        res.clearCookie("connect.sid");
        res.json({ success: true });
      });
    });
  });

  // Also support GET for backwards compatibility
  app.get("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      req.session.destroy((destroyErr) => {
        if (destroyErr) {
          return res.status(500).json({ error: "Failed to destroy session" });
        }
        res.clearCookie("connect.sid");
        res.redirect("/");
      });
    });
  });
}

export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  console.log("[isAuthenticated] Checking authentication");
  console.log("[isAuthenticated] req.isAuthenticated():", req.isAuthenticated());
  console.log("[isAuthenticated] req.user:", req.user);
  console.log("[isAuthenticated] req.user?.id:", req.user?.id);
  console.log("[isAuthenticated] req.session:", req.session ? "exists" : "missing");
  console.log("[isAuthenticated] req.cookies:", JSON.stringify(req.cookies));
  
  if (!req.isAuthenticated() || !req.user || !req.user.id) {
    console.log("[isAuthenticated] User not authenticated or missing user.id, returning 401");
    return res.status(401).json({ message: "Unauthorized" });
  }
  console.log("[isAuthenticated] User authenticated, proceeding");
  return next();
};
