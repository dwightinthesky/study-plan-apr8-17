import { watch } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const projectName = process.env.CF_PAGES_PROJECT || "study-plan-apr8-17";
const rootDir = process.cwd();
const wranglerBin = path.join(rootDir, "node_modules", ".bin", "wrangler");
const ignoredSegments = new Set([".git", ".wrangler", "node_modules"]);
const ignoredSuffixes = [".log", ".tmp", ".swp"];

let debounceTimer;
let running = false;
let rerunRequested = false;

function timestamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";
}

function shouldIgnore(filename = "") {
  if (!filename) return false;
  const normalized = filename.split(path.sep).join("/");
  const segments = normalized.split("/");

  if (segments.some((segment) => ignoredSegments.has(segment))) {
    return true;
  }

  return ignoredSuffixes.some((suffix) => normalized.endsWith(suffix));
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      env: process.env
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });

    child.on("error", reject);
  });
}

function readStdout(command, args) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(new Error(stderr.trim() || `${command} ${args.join(" ")} failed with code ${code}`));
    });

    child.on("error", reject);
  });
}

async function hasChanges() {
  const output = await readStdout("git", ["status", "--porcelain"]);
  return output.length > 0;
}

async function hasStagedChanges() {
  try {
    await run("git", ["diff", "--cached", "--quiet"]);
    return false;
  } catch {
    return true;
  }
}

async function publish(triggerLabel) {
  if (running) {
    rerunRequested = true;
    return;
  }

  running = true;

  try {
    if (!(await hasChanges())) {
      console.log(`[auto-publish] No changes detected for ${triggerLabel}.`);
      return;
    }

    console.log(`[auto-publish] Publishing changes triggered by ${triggerLabel}...`);
    await run("git", ["add", "-A"]);

    if (!(await hasStagedChanges())) {
      console.log("[auto-publish] Nothing staged after git add.");
      return;
    }

    const message = `auto: update ${timestamp()}`;
    await run("git", ["commit", "-m", message]);
    await run("git", ["push", "origin", "main"]);
    await run(wranglerBin, ["pages", "deploy", "public", "--project-name", projectName]);
    console.log(`[auto-publish] Finished for ${triggerLabel}. Cloudflare project: ${projectName}`);
  } catch (error) {
    console.error("[auto-publish] Failed:", error.message);
  } finally {
    running = false;

    if (rerunRequested) {
      rerunRequested = false;
      schedulePublish("queued change");
    }
  }
}

function schedulePublish(triggerLabel) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    publish(triggerLabel);
  }, 1500);
}

console.log(`[auto-publish] Watching ${rootDir}`);
console.log(`[auto-publish] Target Cloudflare Pages project: ${projectName}`);

const watcher = watch(rootDir, { recursive: true }, (_eventType, filename) => {
  if (shouldIgnore(filename)) {
    return;
  }

  const label = filename ? filename.toString() : "unknown file";
  console.log(`[auto-publish] Change detected: ${label}`);
  schedulePublish(label);
});

process.on("SIGINT", () => {
  watcher.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  watcher.close();
  process.exit(0);
});
