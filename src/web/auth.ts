import bcrypt from "bcrypt";
import type { Request, Response, NextFunction } from "express";

import { log } from "../services/logging.js";

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

      if (user !== username) {
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
