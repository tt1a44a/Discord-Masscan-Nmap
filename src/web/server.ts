import express from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { config } from "../config/index.js";
import { log } from "../services/logging.js";
import { basicAuthMiddleware } from "./auth.js";
import { apiRouter } from "./routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function startWebServer() {
  const app = express();
  const port = parseInt(process.env.WEB_PORT ?? "3000", 10);

  if (!config.webUsername || !config.webPasswordHash) {
    log.warn("Web UI disabled: UI_USERNAME or UI_PASSWORD_HASH missing");
    return;
  }

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Static assets (public folder)
  const publicPath = join(__dirname, "../../public");
  app.use(express.static(publicPath));

  // API routes (protected by basic auth)
  app.use("/api", basicAuthMiddleware(config.webUsername, config.webPasswordHash), apiRouter);

  // Health check
  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.listen(port, "0.0.0.0", () => {
    log.info("Web server started", { port });
  });
}
