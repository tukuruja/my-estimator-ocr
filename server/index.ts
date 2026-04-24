import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createAppStateApiMiddleware } from "./appStateApi";
import { createConsensusApiMiddleware } from "./consensusApi";
import { createEstimationLogicApiMiddleware } from "./estimationLogicApi";
import { createMasterApiMiddleware } from "./masterApi";
import { createOcrLearningApiMiddleware } from "./ocrLearningApi";
import { createOcrPackApiMiddleware } from "./ocrPackApi";
import { createReportApiMiddleware } from "./reportApi";
import { createGmailApiMiddleware } from "./gmailApi";
import { createOcrEnhanceApiMiddleware } from "./ocrEnhanceApi";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseCorsOrigins(): { allowOrigins: string[]; allowOriginRegex: RegExp | null } {
  const defaultOrigins = [
    "http://127.0.0.1:3000",
    "http://localhost:3000",
  ];
  const envOrigins = (process.env.CORS_ALLOW_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowOriginRegex = process.env.CORS_ALLOW_ORIGIN_REGEX
    ? new RegExp(process.env.CORS_ALLOW_ORIGIN_REGEX)
    : null;

  return {
    allowOrigins: Array.from(new Set([...defaultOrigins, ...envOrigins])),
    allowOriginRegex,
  };
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const { allowOrigins, allowOriginRegex } = parseCorsOrigins();

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (allowOrigins.includes(origin) || allowOriginRegex?.test(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Workspace-Id");
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  });

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ success: true, status: "ok" });
  });

  app.use(createConsensusApiMiddleware());
  app.use(createEstimationLogicApiMiddleware());
  app.use(createOcrLearningApiMiddleware());
  app.use(createOcrPackApiMiddleware());
  app.use(createMasterApiMiddleware());
  app.use(createReportApiMiddleware());
  app.use(createGmailApiMiddleware());
  app.use(createOcrEnhanceApiMiddleware());
  app.use(createAppStateApiMiddleware());

  if (process.env.API_ONLY === "true") {
    app.get("*", (_req, res) => {
      res.status(404).json({ success: false, error: { message: "API only mode" } });
    });
  } else {

    // Serve static files from dist/public in production
    const staticPath =
      process.env.NODE_ENV === "production"
        ? path.resolve(__dirname, "public")
        : path.resolve(__dirname, "..", "dist", "public");

    app.use(express.static(staticPath));

    // Handle client-side routing - serve index.html for all routes
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
  }

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
