#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const RELEASE_WORKFLOW_PATH = ".github/workflows/release.yml";
const TAURI_CONFIG_PATH = "src-tauri/tauri.conf.json";
const UPDATER_ENDPOINT =
  "https://github.com/galza-guo/Panorama/releases/latest/download/latest.json";

function readFile(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

function writeFile(relPath, content) {
  fs.writeFileSync(path.join(repoRoot, relPath), content, "utf8");
}

function fileExists(relPath) {
  return fs.existsSync(path.join(repoRoot, relPath));
}

function releaseVersionFiles() {
  const coreLock = "src-core/Cargo.lock";
  const serverLock = "src-server/Cargo.lock";
  const tauriLock = "src-tauri/Cargo.lock";

  return [
    "package.json",
    ...(fileExists(coreLock) ? [coreLock] : []),
    "src-core/Cargo.toml",
    ...(fileExists(serverLock) ? [serverLock] : []),
    "src-server/Cargo.toml",
    "src-tauri/Cargo.toml",
    ...(fileExists(tauriLock) ? [tauriLock] : []),
    "src-tauri/tauri.conf.json",
  ];
}

function run(cmd, options = {}) {
  return execSync(cmd, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });
}

function quote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function isSemver(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
}

function parseArgs(argv) {
  const command = argv[0] || "help";
  const positional = [];
  const flags = {};

  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--") {
      continue;
    }
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const [key, inlineValue] = token.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      flags[key] = inlineValue;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    i += 1;
  }

  return { command, positional, flags };
}

function ensureVersionInput(version) {
  if (!version) {
    throw new Error("Missing version. Example: 0.1.0");
  }
  if (version.startsWith("v")) {
    throw new Error(`Use bare version without 'v': ${version}`);
  }
  if (!isSemver(version)) {
    throw new Error(`Invalid semver: ${version}`);
  }
  return version;
}

function readPackageJsonVersion() {
  const content = JSON.parse(readFile("package.json"));
  if (typeof content.version !== "string") {
    throw new Error("package.json has no string version");
  }
  return content.version;
}

function writePackageJsonVersion(version) {
  const file = "package.json";
  const json = JSON.parse(readFile(file));
  json.version = version;
  writeFile(file, `${JSON.stringify(json, null, 2)}\n`);
}

function readTauriConfig() {
  return JSON.parse(readFile(TAURI_CONFIG_PATH));
}

function writeTauriConfig(config) {
  writeFile(TAURI_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

function readTauriVersion() {
  const config = readTauriConfig();
  if (typeof config.version !== "string") {
    throw new Error("src-tauri/tauri.conf.json has no string version");
  }
  return config.version;
}

function writeTauriVersion(version) {
  const config = readTauriConfig();
  config.version = version;
  writeTauriConfig(config);
}

function readCargoVersion(relPath) {
  const content = readFile(relPath);
  const match = content.match(/\[package\][\s\S]*?^\s*version\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error(`Could not locate [package].version in ${relPath}`);
  }
  return match[1];
}

function readCargoLockPackageVersion(lockPath, packageName) {
  if (!fileExists(lockPath)) {
    return null;
  }
  const content = readFile(lockPath);
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    String.raw`\[\[package\]\]\nname = "${escaped}"\nversion = "([^"]+)"`,
    "m",
  );
  const match = content.match(regex);
  return match ? match[1] : null;
}

function writeCargoLockPackageVersion(lockPath, packageName, version) {
  if (!fileExists(lockPath)) {
    return;
  }
  const content = readFile(lockPath);
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    String.raw`(\[\[package\]\]\nname = "${escaped}"\nversion = ")([^"]+)(")`,
    "m",
  );
  const replaced = content.replace(regex, `$1${version}$3`);
  if (replaced !== content) {
    writeFile(lockPath, replaced);
  }
}

function writeCargoVersion(relPath, version) {
  const content = readFile(relPath);
  const replaced = content.replace(
    /(\[package\][\s\S]*?^\s*version\s*=\s*")([^"]+)(")/m,
    `$1${version}$3`,
  );
  if (replaced === content) {
    throw new Error(`Failed to update [package].version in ${relPath}`);
  }
  writeFile(relPath, replaced);
}

function currentVersions() {
  const versions = {
    "package.json": readPackageJsonVersion(),
    "src-tauri/Cargo.toml": readCargoVersion("src-tauri/Cargo.toml"),
    "src-core/Cargo.toml": readCargoVersion("src-core/Cargo.toml"),
    "src-server/Cargo.toml": readCargoVersion("src-server/Cargo.toml"),
    "src-tauri/tauri.conf.json": readTauriVersion(),
  };

  const coreLockCoreVersion = readCargoLockPackageVersion("src-core/Cargo.lock", "panorama_core");
  if (coreLockCoreVersion) {
    versions["src-core/Cargo.lock (panorama_core)"] = coreLockCoreVersion;
  }

  const serverLockVersion = readCargoLockPackageVersion(
    "src-server/Cargo.lock",
    "panorama-server",
  );
  if (serverLockVersion) {
    versions["src-server/Cargo.lock (panorama-server)"] = serverLockVersion;
  }

  const serverLockCoreVersion = readCargoLockPackageVersion(
    "src-server/Cargo.lock",
    "panorama_core",
  );
  if (serverLockCoreVersion) {
    versions["src-server/Cargo.lock (panorama_core)"] = serverLockCoreVersion;
  }

  const tauriLockAppVersion = readCargoLockPackageVersion(
    "src-tauri/Cargo.lock",
    "panorama-app",
  );
  if (tauriLockAppVersion) {
    versions["src-tauri/Cargo.lock (panorama-app)"] = tauriLockAppVersion;
  }

  const tauriLockCoreVersion = readCargoLockPackageVersion(
    "src-tauri/Cargo.lock",
    "panorama_core",
  );
  if (tauriLockCoreVersion) {
    versions["src-tauri/Cargo.lock (panorama_core)"] = tauriLockCoreVersion;
  }

  return versions;
}

function alignVersions(version) {
  writePackageJsonVersion(version);
  writeCargoLockPackageVersion("src-core/Cargo.lock", "panorama_core", version);
  writeCargoVersion("src-core/Cargo.toml", version);
  writeCargoLockPackageVersion("src-server/Cargo.lock", "panorama-server", version);
  writeCargoLockPackageVersion("src-server/Cargo.lock", "panorama_core", version);
  writeCargoVersion("src-server/Cargo.toml", version);
  writeCargoVersion("src-tauri/Cargo.toml", version);
  writeCargoLockPackageVersion("src-tauri/Cargo.lock", "panorama-app", version);
  writeCargoLockPackageVersion("src-tauri/Cargo.lock", "panorama_core", version);
  writeTauriVersion(version);
}

function fixTauriUpdaterConfig() {
  const config = readTauriConfig();
  config.bundle = config.bundle || {};
  config.bundle.createUpdaterArtifacts = "v1Compatible";

  config.plugins = config.plugins || {};
  config.plugins.updater = config.plugins.updater || {};
  config.plugins.updater.endpoints = [UPDATER_ENDPOINT];

  writeTauriConfig(config);
}

function fixReleaseWorkflow() {
  let content = readFile(RELEASE_WORKFLOW_PATH);

  content = content.replace(/tags:\n(?:\s+-\s*".*"\n)+/, 'tags:\n      - "v*.*.*"\n');
  content = content.replace(/releaseDraft:\s*(true|false)/, "releaseDraft: false");

  const validatorCommand = 'node scripts/release.mjs check --tag "${{ github.ref_name }}"';
  if (!content.includes(validatorCommand)) {
    const checkoutBlockRegex =
      /(\s+- name: Checkout repository\n\s+uses: actions\/checkout@v4\n)/;
    const validatorStep = [
      "      - name: Validate release metadata",
      "        if: startsWith(github.ref, 'refs/tags/')",
      `        run: ${validatorCommand}`,
      "",
    ].join("\n");
    content = content.replace(checkoutBlockRegex, `$1\n${validatorStep}`);
  }

  writeFile(RELEASE_WORKFLOW_PATH, content);
}

function validateReleaseConfig(expectedVersion, expectedTag) {
  const issues = [];

  const versions = currentVersions();
  const uniqueVersions = [...new Set(Object.values(versions))];

  if (uniqueVersions.length !== 1) {
    issues.push(
      `Version mismatch across files: ${Object.entries(versions)
        .map(([file, version]) => `${file}=${version}`)
        .join(", ")}`,
    );
  }

  if (expectedVersion) {
    for (const [file, version] of Object.entries(versions)) {
      if (version !== expectedVersion) {
        issues.push(`Expected ${file} to be ${expectedVersion}, got ${version}`);
      }
    }
  }

  if (expectedTag) {
    const normalizedTag = expectedTag.trim();
    const effectiveVersion = expectedVersion || versions["package.json"];
    const requiredTag = `v${effectiveVersion}`;
    if (normalizedTag !== requiredTag) {
      issues.push(`Tag mismatch: expected ${requiredTag}, got ${normalizedTag}`);
    }
  }

  const tauriConfig = readTauriConfig();
  if (tauriConfig.bundle?.createUpdaterArtifacts !== "v1Compatible") {
    issues.push(`src-tauri/tauri.conf.json missing bundle.createUpdaterArtifacts=v1Compatible`);
  }

  const endpoints = tauriConfig.plugins?.updater?.endpoints;
  if (!Array.isArray(endpoints) || endpoints.length !== 1 || endpoints[0] !== UPDATER_ENDPOINT) {
    issues.push(
      `src-tauri/tauri.conf.json updater endpoint must be exactly ${UPDATER_ENDPOINT}`,
    );
  }

  const releaseWorkflow = readFile(RELEASE_WORKFLOW_PATH);
  if (!releaseWorkflow.includes('- "v*.*.*"')) {
    issues.push(`${RELEASE_WORKFLOW_PATH} must use push.tags = "v*.*.*"`);
  }

  if (!releaseWorkflow.includes("releaseDraft: false")) {
    issues.push(`${RELEASE_WORKFLOW_PATH} must set releaseDraft: false`);
  }

  if (!releaseWorkflow.includes('node scripts/release.mjs check --tag "${{ github.ref_name }}"')) {
    issues.push(`${RELEASE_WORKFLOW_PATH} must run release metadata validation step`);
  }

  if (!releaseWorkflow.includes("if: startsWith(github.ref, 'refs/tags/')")) {
    issues.push(`${RELEASE_WORKFLOW_PATH} release validation step must run only for tag refs`);
  }

  return { issues, versions };
}

function printIssues(issues) {
  console.error("\nRelease check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  console.error(
    "\nAuto-fix command:\n  node scripts/release.mjs check --fix --version <x.y.z> --tag v<x.y.z>",
  );
  console.error("Quick path:\n  node scripts/release.mjs prepare <x.y.z>\n");
}

function doCheck({ fix, version, tag }) {
  let targetVersion = version;
  if (targetVersion) {
    targetVersion = ensureVersionInput(targetVersion);
  }

  if (fix) {
    const canonicalVersion = targetVersion || readPackageJsonVersion();
    alignVersions(canonicalVersion);
    fixTauriUpdaterConfig();
    fixReleaseWorkflow();
    targetVersion = canonicalVersion;
  }

  const { issues, versions } = validateReleaseConfig(targetVersion, tag);
  if (issues.length > 0) {
    printIssues(issues);
    process.exitCode = 1;
    return;
  }

  console.log("Release metadata check passed.");
  console.log(
    Object.entries(versions)
      .map(([file, current]) => `${file}: ${current}`)
      .join("\n"),
  );
}

function doPrepare(version) {
  const normalized = ensureVersionInput(version);
  doCheck({ fix: true, version: normalized, tag: `v${normalized}` });
  if (process.exitCode) {
    return;
  }
  console.log(`\nPrepared release ${normalized}.`);
  console.log("Next steps:");
  console.log(`1. Review diff: git diff`);
  console.log(`2. Commit + tag: node scripts/release.mjs cut ${normalized} [--push]`);
}

function ensureTagAbsent(tag) {
  try {
    run(`git rev-parse -q --verify ${quote(`refs/tags/${tag}`)}`);
    throw new Error(`Tag already exists: ${tag}`);
  } catch (error) {
    if (!String(error.message || error).includes("Tag already exists")) {
      return;
    }
    throw error;
  }
}

function doCut(version, shouldPush) {
  const normalized = ensureVersionInput(version);
  const tag = `v${normalized}`;
  doPrepare(normalized);
  if (process.exitCode) {
    return;
  }

  ensureTagAbsent(tag);

  const filesToStage = releaseVersionFiles();
  const addCommand = `git add ${filesToStage.map(quote).join(" ")}`;
  run(addCommand);

  const staged = run("git diff --cached --name-only").trim();
  if (!staged) {
    throw new Error("No staged release version changes found.");
  }

  run(`git commit -m ${quote(`chore(release): v${normalized}`)}`);
  run(`git tag -a ${quote(tag)} -m ${quote(`Release ${tag}`)}`);

  console.log(`Committed release version files and created tag ${tag}.`);

  if (shouldPush) {
    run("git push origin HEAD");
    run(`git push origin ${quote(tag)}`);
    console.log(`Pushed commit and tag ${tag} to origin.`);
  } else {
    console.log(`Tag ${tag} is local only. Push when ready:`);
    console.log(`git push origin HEAD && git push origin ${tag}`);
  }
}

function printHelp() {
  console.log(`Release automation script

Usage:
  node scripts/release.mjs check [--version x.y.z] [--tag vx.y.z] [--fix]
  node scripts/release.mjs prepare <x.y.z>
  node scripts/release.mjs cut <x.y.z> [--push]

Examples:
  node scripts/release.mjs prepare 0.1.0
  node scripts/release.mjs check --tag v0.1.0
  node scripts/release.mjs cut 0.1.0 --push
`);
}

function main() {
  try {
    const { command, positional, flags } = parseArgs(process.argv.slice(2));

    switch (command) {
      case "check":
        doCheck({
          fix: Boolean(flags.fix),
          version: typeof flags.version === "string" ? flags.version : undefined,
          tag: typeof flags.tag === "string" ? flags.tag : undefined,
        });
        break;
      case "prepare":
        doPrepare(positional[0]);
        break;
      case "cut":
        doCut(positional[0], Boolean(flags.push));
        break;
      case "help":
      case "--help":
      case "-h":
      default:
        printHelp();
        break;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
