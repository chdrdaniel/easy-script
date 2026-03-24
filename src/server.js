// Author: yuanxun.mei@gmail.com
const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT_DIR = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT_DIR, "config", "app.config.json");
const HISTORY_PATH = path.join(ROOT_DIR, "data", "run-history.jsonl");
const LOGS_DIR = path.join(ROOT_DIR, "logs");

function pickShell(config) {
  if (config.shell && typeof config.shell === "string") {
    return config.shell;
  }
  if (process.env.SCRIPT_CONSOLE_SHELL) {
    return process.env.SCRIPT_CONSOLE_SHELL;
  }
  if (fs.existsSync("/bin/zsh")) {
    return "/bin/zsh";
  }
  if (fs.existsSync("/bin/bash")) {
    return "/bin/bash";
  }
  return "/bin/sh";
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `Missing config file: ${CONFIG_PATH}. Copy config/app.config.example.json to config/app.config.json first.`
    );
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const cfg = JSON.parse(raw);
  if (!cfg.adminPassword || !cfg.sessionSecret) {
    throw new Error("Config requires adminPassword and sessionSecret.");
  }
  if (!Array.isArray(cfg.scripts) || cfg.scripts.length === 0) {
    throw new Error("Config requires a non-empty scripts array.");
  }
  const scriptIds = new Set();
  for (const script of cfg.scripts) {
    if (!script.id || !script.name || !script.command) {
      throw new Error("Each script needs id, name, command.");
    }
    if (scriptIds.has(script.id)) {
      throw new Error(`Duplicate script id: ${script.id}`);
    }
    scriptIds.add(script.id);
  }
  return cfg;
}

async function ensureRuntimeFiles() {
  await fsp.mkdir(path.dirname(HISTORY_PATH), { recursive: true });
  await fsp.mkdir(LOGS_DIR, { recursive: true });
  if (!fs.existsSync(HISTORY_PATH)) {
    await fsp.writeFile(HISTORY_PATH, "", "utf8");
  }
}

async function appendHistory(record) {
  await fsp.appendFile(HISTORY_PATH, `${JSON.stringify(record)}\n`, "utf8");
}

async function readHistory(limit = 100) {
  const raw = await fsp.readFile(HISTORY_PATH, "utf8");
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const records = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      // Skip malformed records.
    }
  }
  return records.slice(-limit).reverse();
}

function findScriptById(config, scriptId) {
  return config.scripts.find((item) => item.id === scriptId);
}

function resolveLogPath(relativePath) {
  if (!relativePath || typeof relativePath !== "string") {
    return null;
  }
  const candidate = path.resolve(ROOT_DIR, relativePath);
  const logsRoot = `${LOGS_DIR}${path.sep}`;
  if (!candidate.startsWith(logsRoot)) {
    return null;
  }
  return candidate;
}

function requireAuth(req, res, next) {
  if (req.session?.isAuthenticated) {
    return next();
  }
  if (req.path.startsWith("/api")) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }
  return res.redirect("/login");
}

async function bootstrap() {
  const config = loadConfig();
  await ensureRuntimeFiles();
  const shellPath = pickShell(config);

  const app = express();
  const runningJobs = new Map();

  app.set("view engine", "ejs");
  app.set("views", path.join(ROOT_DIR, "views"));

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(
    session({
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 12 * 60 * 60 * 1000,
      },
    })
  );
  app.use("/public", express.static(path.join(ROOT_DIR, "public")));

  app.get("/login", (req, res) => {
    if (req.session?.isAuthenticated) {
      return res.redirect("/");
    }
    return res.render("login", { error: null });
  });

  app.post("/login", (req, res) => {
    const password = String(req.body.password || "");
    if (password !== config.adminPassword) {
      return res.status(401).render("login", { error: "密码错误，请重试。" });
    }
    req.session.isAuthenticated = true;
    return res.redirect("/");
  });

  app.post("/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/login");
    });
  });

  app.get("/", requireAuth, async (req, res) => {
    res.render("dashboard", {
      scripts: config.scripts,
      runningCount: runningJobs.size,
    });
  });

  app.get("/api/history", requireAuth, async (_req, res) => {
    const history = await readHistory(100);
    res.json({ ok: true, history });
  });

  app.get("/api/history/:scriptId", requireAuth, async (req, res) => {
    const script = findScriptById(config, req.params.scriptId);
    if (!script) {
      return res.status(404).json({ ok: false, message: "Script not found" });
    }
    const history = await readHistory(300);
    const filtered = history.filter((item) => item.scriptId === script.id).slice(0, 100);
    return res.json({ ok: true, history: filtered });
  });

  app.get("/api/running", requireAuth, (_req, res) => {
    const jobs = Array.from(runningJobs.values()).map((job) => ({
      runId: job.runId,
      scriptId: job.scriptId,
      scriptName: job.scriptName,
      startTime: job.startTime,
    }));
    res.json({ ok: true, running: jobs });
  });

  app.get("/api/logs", requireAuth, async (req, res) => {
    const type = String(req.query.type || "stdout");
    const relativePath =
      type === "stderr" ? String(req.query.stderrFile || "") : String(req.query.stdoutFile || "");
    const fullPath = resolveLogPath(relativePath);
    if (!fullPath) {
      return res.status(400).json({ ok: false, message: "Invalid log file path" });
    }
    try {
      const content = await fsp.readFile(fullPath, "utf8");
      return res.json({
        ok: true,
        type,
        file: relativePath,
        content,
      });
    } catch (err) {
      return res.status(404).json({ ok: false, message: `Cannot read log file: ${err.message}` });
    }
  });

  app.post("/api/run/:scriptId", requireAuth, async (req, res) => {
    const script = findScriptById(config, req.params.scriptId);
    if (!script) {
      return res.status(404).json({ ok: false, message: "Script not found" });
    }
    if (runningJobs.has(script.id)) {
      return res.status(409).json({ ok: false, message: "Script is already running" });
    }

    const runId = crypto.randomUUID();
    const startTime = new Date().toISOString();
    const safeName = script.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const stdoutFile = path.join("logs", `${safeName}-${runId}-stdout.log`);
    const stderrFile = path.join("logs", `${safeName}-${runId}-stderr.log`);
    const fullStdoutPath = path.join(ROOT_DIR, stdoutFile);
    const fullStderrPath = path.join(ROOT_DIR, stderrFile);
    const startedAtMs = Date.now();
    const cwd = script.cwd ? path.resolve(ROOT_DIR, script.cwd) : ROOT_DIR;
    const shellArgs = shellPath.endsWith("zsh") || shellPath.endsWith("bash")
      ? ["-lc", script.command]
      : ["-c", script.command];
    let historyWritten = false;

    const appendHistoryOnce = async (record) => {
      if (historyWritten) {
        return;
      }
      historyWritten = true;
      await appendHistory(record);
    };

    let shellProc;
    try {
      const outStream = fs.createWriteStream(fullStdoutPath, { flags: "a" });
      const errStream = fs.createWriteStream(fullStderrPath, { flags: "a" });
      shellProc = spawn(shellPath, shellArgs, {
        cwd,
        env: process.env,
      });
      shellProc.stdout.pipe(outStream);
      shellProc.stderr.pipe(errStream);

      runningJobs.set(script.id, {
        runId,
        scriptId: script.id,
        scriptName: script.name,
        startTime,
      });

      shellProc.on("close", async (code, signal) => {
        const endTime = new Date().toISOString();
        const durationMs = Date.now() - startedAtMs;
        runningJobs.delete(script.id);
        const status = code === 0 ? "success" : "failed";
        await appendHistoryOnce({
          runId,
          scriptId: script.id,
          scriptName: script.name,
          command: script.command,
          shell: shellPath,
          cwd,
          startTime,
          endTime,
          durationMs,
          status,
          exitCode: code,
          signal: signal || null,
          stdoutFile,
          stderrFile,
        });
      });

      shellProc.on("error", async (err) => {
        const endTime = new Date().toISOString();
        runningJobs.delete(script.id);
        try {
          await fsp.appendFile(fullStderrPath, `${err.message}\n`, "utf8");
        } catch {
          // Ignore best-effort stderr write.
        }
        await appendHistoryOnce({
          runId,
          scriptId: script.id,
          scriptName: script.name,
          command: script.command,
          shell: shellPath,
          cwd,
          startTime,
          endTime,
          durationMs: Date.now() - startedAtMs,
          status: "spawn_error",
          exitCode: null,
          signal: null,
          stdoutFile,
          stderrFile,
          errorMessage: err.message,
        });
      });
    } catch (err) {
      return res.status(500).json({ ok: false, message: `Failed to start script: ${err.message}` });
    }

    return res.json({
      ok: true,
      message: `Started ${script.name}`,
      runId,
      startTime,
    });
  });

  app.get("/script/:scriptId", requireAuth, async (req, res) => {
    const script = findScriptById(config, req.params.scriptId);
    if (!script) {
      return res.status(404).send("Script not found");
    }
    const history = (await readHistory(300)).filter((item) => item.scriptId === script.id).slice(0, 100);
    return res.render("script-detail", {
      script,
      history,
    });
  });

  const port = Number(process.env.PORT || config.port || 3000);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Script control panel running at http://localhost:${port}`);
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
