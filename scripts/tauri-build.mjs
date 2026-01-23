/**
 * Usage:
 *   pnpm tauri:build -- [tauri build args...]
 *   pnpm tauri:build:mac:arm64 -- [tauri build args...]
 *
 * Purpose:
 * - Avoid failing local builds when updater signing is enabled in `tauri.conf.json`
 *   but `TAURI_SIGNING_PRIVATE_KEY` is not set.
 *
 * How it works:
 * - If running locally (not CI) and no signing private key is provided, we merge a small
 *   config overlay that disables `bundle.createUpdaterArtifacts`.
 * - CI/release builds (with signing keys) keep the default behavior and still generate
 *   updater artifacts + signatures.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const localDir = resolve(projectRoot, ".local");
const overlayPath = resolve(localDir, "tauri.build.local.json");

function hasNonWhitespace(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isCiEnv() {
  return process.env.GITHUB_ACTIONS === "true" || hasNonWhitespace(process.env.CI);
}

function ensureLocalBuildOverlayFileExists() {
  if (existsSync(overlayPath)) return;

  mkdirSync(localDir, { recursive: true });

  const overlay = {
    bundle: {
      createUpdaterArtifacts: false,
    },
  };

  writeFileSync(overlayPath, JSON.stringify(overlay, null, 2) + "\n", "utf8");
  console.log(`[tauri:build] Created local overlay: ${overlayPath}`);
}

function run() {
  const userArgs = process.argv.slice(2);

  // pnpm passes a literal `--` separator to the underlying command, and if the script
  // already has args (e.g. `--target ...`) it won't be at index 0. Strip it so flags
  // like `--verbose` go to `tauri build` by default. If you need to pass runner args,
  // use `pnpm <script> -- -- <runner-args...>` (two `--`).
  if (hasNonWhitespace(process.env.npm_lifecycle_event)) {
    const pnpmSeparatorIndex = userArgs.indexOf("--");
    if (pnpmSeparatorIndex !== -1) {
      userArgs.splice(pnpmSeparatorIndex, 1);
    }
  }

  const hasSigningKey = hasNonWhitespace(process.env.TAURI_SIGNING_PRIVATE_KEY);
  const shouldDisableUpdaterArtifacts = !isCiEnv() && !hasSigningKey;

  const tauriArgs = ["build"];
  if (shouldDisableUpdaterArtifacts) {
    ensureLocalBuildOverlayFileExists();
    console.log(
      "[tauri:build] TAURI_SIGNING_PRIVATE_KEY not set; disabling bundle.createUpdaterArtifacts for local build."
    );
    tauriArgs.push("-c", overlayPath);
  }
  tauriArgs.push(...userArgs);

  const child = spawn("tauri", tauriArgs, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`[tauri:build] exited with signal: ${signal}`);
      process.exit(1);
    }
    process.exit(code ?? 1);
  });

  child.on("error", (err) => {
    console.error(`[tauri:build] failed to spawn tauri: ${err?.message ?? err}`);
    process.exit(1);
  });
}

run();
