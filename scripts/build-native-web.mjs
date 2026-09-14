import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const excludeRoot = path.join(repo, ".native-exclude");
const excludedTrees = ["src/app/api", "src/app/diary/[id]"];
const moves = excludedTrees.map((relative, index) => ({
  from: path.join(repo, relative),
  to: path.join(excludeRoot, ["api", "diary-id"][index]),
}));

const requiredPages = [
  "index.html",
  "diary/index.html",
  "diary/new/index.html",
  "diary/open/index.html",
  "timeline/index.html",
  "calendar/index.html",
  "search/index.html",
  "life/index.html",
  "account/index.html",
];

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function posixRel(target) {
  return path.relative(repo, target).split(path.sep).join("/");
}

async function listIncompatibleRoutes(appDir = path.join(repo, "src/app")) {
  const found = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const relative = posixRel(full);
      if (entry.isDirectory()) {
        if (entry.name.startsWith("[") && entry.name.endsWith("]")) found.push(relative);
        await walk(full);
      } else if (/^route\.(t|j)sx?$/.test(entry.name)) {
        found.push(relative);
      }
    }
  }
  await walk(appDir);
  return [...new Set(found)].sort();
}

function isExcluded(relative) {
  return excludedTrees.some((tree) => relative === tree || relative.startsWith(`${tree}/`));
}

async function assertKnownServerRoutes() {
  const found = await listIncompatibleRoutes();
  const unexpected = found.filter((relative) => !isExcluded(relative));
  if (unexpected.length > 0) {
    throw new Error(`Native export has unhandled server routes: ${unexpected.join(", ")}`);
  }
  for (const tree of excludedTrees) {
    if (!(await pathExists(path.join(repo, tree)))) {
      throw new Error(`Native export expected ${tree} to exist before exclusion.`);
    }
  }
  if (found.length === 0) {
    throw new Error("Native export expected /api and /diary/[id] to exist before exclusion.");
  }
}

async function assertNoServerRoutesRemain() {
  const found = await listIncompatibleRoutes();
  if (found.length > 0) {
    throw new Error(`Native export still contains server routes: ${found.join(", ")}`);
  }
}

function spawnCommand(args, env, inherit) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repo,
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    let output = "";
    if (!inherit) {
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      child.stderr.on("data", (chunk) => {
        output += chunk;
      });
    }
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, output }));
  });
}

async function assertUnexcludedNativeConfigFails() {
  const result = await spawnCommand(
    [
      path.join(repo, "node_modules/tsx/dist/cli.mjs"),
      "-e",
      "process.env.LIFE_NATIVE='1'; process.env.NEXT_PUBLIC_LIFE_NATIVE='1'; import('./next.config.ts').then(() => process.exit(0), (error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); })",
    ],
    {},
    false,
  );
  if (result.code === 0 || !result.output.includes("native:web")) {
    throw new Error(
      `LIFE_NATIVE=1 must fail while /api and /diary/[id] remain. code=${result.code} output=${result.output}`,
    );
  }
  console.log("Verified: LIFE_NATIVE=1 rejects the unexcluded App Router tree.");
}

async function restoreTree() {
  await mkdir(excludeRoot, { recursive: true });
  for (const move of moves) {
    if (await pathExists(move.to) && !(await pathExists(move.from))) {
      await mkdir(path.dirname(move.from), { recursive: true });
      await rename(move.to, move.from);
    }
  }
}

async function excludeTree() {
  await mkdir(excludeRoot, { recursive: true });
  for (const move of moves) {
    if (!(await pathExists(move.from))) {
      throw new Error(`Missing ${posixRel(move.from)} before native export.`);
    }
    if (await pathExists(move.to)) await rm(move.to, { recursive: true, force: true });
    await rename(move.from, move.to);
  }
}

async function runNextBuild() {
  const result = await spawnCommand(
    [path.join(repo, "node_modules/next/dist/bin/next"), "build"],
    {
      LIFE_NATIVE: "1",
      NEXT_PUBLIC_LIFE_NATIVE: "1",
      NEXT_PUBLIC_LIFE_VISUALIZATION_DEMO: "0",
    },
    true,
  );
  if (result.code !== 0) throw new Error(`next build exited with ${result.code}`);
}

async function withHiddenWebNext(task) {
  const webNext = path.join(repo, ".next");
  const backup = path.join(repo, ".next-web-keep");
  let moved = false;
  if (await pathExists(webNext)) {
    if (await pathExists(backup)) await rm(backup, { recursive: true, force: true });
    await rename(webNext, backup);
    moved = true;
  }
  try {
    await task();
  } finally {
    if (moved) {
      if (await pathExists(webNext)) await rm(webNext, { recursive: true, force: true });
      await rename(backup, webNext);
    }
  }
}

async function assertExport() {
  const outDir = path.join(repo, "out");
  if (!(await pathExists(outDir))) throw new Error("Native export did not produce out/.");
  for (const relative of requiredPages) {
    const file = path.join(outDir, relative);
    if (!(await pathExists(file))) throw new Error(`Native export missing ${relative}`);
  }
  if (await pathExists(path.join(outDir, "api"))) {
    throw new Error("Native export must not contain /api.");
  }
  const diaryEntries = await readdir(path.join(outDir, "diary"));
  const unexpected = diaryEntries.filter((name) => {
    if (["index.html", "index.txt", "new", "open"].includes(name)) return false;
    if (name.startsWith("__next")) return false;
    return true;
  });
  if (unexpected.length > 0) {
    throw new Error(`Native export has unexpected diary paths: ${unexpected.join(", ")}`);
  }
  if (existsSync(path.join(repo, "src/app/api")) || existsSync(path.join(repo, "src/app/diary/[id]"))) {
    throw new Error("Excluded routes were restored before the export assertion finished.");
  }
}

async function main() {
  await restoreTree();
  await assertKnownServerRoutes();
  await assertUnexcludedNativeConfigFails();
  let excluded = false;
  try {
    await excludeTree();
    excluded = true;
    await assertNoServerRoutesRemain();
    if (await pathExists(path.join(repo, "out"))) await rm(path.join(repo, "out"), { recursive: true, force: true });
    await withHiddenWebNext(async () => {
      await runNextBuild();
      await assertExport();
    });
    console.log("Native static export verified: server routes excluded, core pages present.");
  } finally {
    if (excluded) await restoreTree();
    if (existsSync(path.join(repo, "src/app/api")) === false || existsSync(path.join(repo, "src/app/diary/[id]")) === false) {
      await restoreTree();
    }
  }
}

main().catch(async (error) => {
  try { await restoreTree(); } catch {}
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
