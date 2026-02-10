import { timingSafeEqual } from "crypto";

import bcrypt from "bcrypt";
import type { Request, Response, NextFunction } from "express";

import { log } from "../services/logging.js";

/** Constant-time string comparison to prevent timing attacks. */
function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function basicAuthMiddleware(username: string, passwordHash: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Basic ")) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Scan Bot"');
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const b64 = authHeader.slice(6);
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      const [user, pass] = decoded.split(":", 2);

      // Guard: both user and password must be non-empty strings.
      if (!user || !pass) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      // Constant-time username comparison.
      if (!safeCompare(user, username)) {
        log.warn("auth failed: invalid username", { user });
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      const valid = await bcrypt.compare(pass, passwordHash);
      if (!valid) {
        log.warn("auth failed: invalid password", { user });
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      next();
    } catch (err) {
      log.error("auth error", { err: String(err) });
      res.status(401).json({ error: "Authentication failed" });
    }
  };
}
