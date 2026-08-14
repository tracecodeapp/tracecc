#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { gunzipSync } from "node:zlib";

const repoRoot = join(import.meta.dirname, "..");
const manifest = JSON.parse(
  readFileSync(join(repoRoot, "toolchain", "manifest.json"), "utf8"),
);
const arguments_ = process.argv.slice(2);
const rootArguments = arguments_.filter((value) => value.startsWith("--root="));
for (const argument of arguments_) {
  if (!["--build", "--offline"].includes(argument) && !argument.startsWith("--root=")) {
    fail(`Unknown argument: ${argument}.`);
  }
}
if (rootArguments.length > 1) fail("Pass --root at most once.");
const rootArgument = rootArguments[0];
if (rootArgument === "--root=") fail("--root must not be empty.");
const toolchainRoot = resolve(
  rootArgument?.slice("--root=".length) ??
    process.env.TRACECC_TOOLCHAIN_ROOT ??
    join(repoRoot, ".cache", "frozen-toolchain"),
);
const shouldBuild = arguments_.includes("--build");
const offline = arguments_.includes("--offline");

function buildPathFor(root) {
  if (!/\s/u.test(root)) return root;
  const alias = join(
    tmpdir(),
    `tracecc-toolchain-${createHash("sha256").update(root).digest("hex").slice(0, 12)}`,
  );
  if (existsSync(alias)) {
    if (readlinkSync(alias) !== root) {
      fail(`TraceCC toolchain alias already points elsewhere: ${alias}.`);
    }
  } else {
    symlinkSync(root, alias, "dir");
  }
  return alias;
}

function fail(message) {
  throw new Error(message);
}

function run(command, commandArguments, options = {}) {
  const capture = options.capture === true;
  const result = spawnSync(command, commandArguments, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(
      `${command} ${commandArguments.join(" ")} failed` +
        (capture ? `:\n${result.stderr || result.stdout}` : "."),
    );
  }
  return capture ? result.stdout.trim() : "";
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function download(artifact, destination) {
  if (existsSync(destination) && sha256(destination) === artifact.sha256) return;
  if (offline) fail(`Offline bootstrap is missing ${artifact.archive}.`);
  mkdirSync(dirname(destination), { recursive: true });
  const temporary = `${destination}.partial-${process.pid}`;
  rmSync(temporary, { force: true });
  const response = await fetch(artifact.url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    fail(`Download failed for ${artifact.url}: HTTP ${response.status}.`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
  const actual = sha256(temporary);
  if (actual !== artifact.sha256) {
    rmSync(temporary, { force: true });
    fail(
      `${artifact.archive} SHA-256 mismatch: expected ${artifact.sha256}, got ${actual}.`,
    );
  }
  renameSync(temporary, destination);
}

function extractArchive(archive, destination, expectedExecutable) {
  if (existsSync(join(destination, expectedExecutable))) return;
  rmSync(destination, { recursive: true, force: true });
  const staging = `${destination}.stage-${process.pid}`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  run("tar", ["-xzf", archive, "-C", staging]);
  const entries = readdirSync(staging).filter((entry) => entry !== ".DS_Store");
  if (entries.length !== 1 || !statSync(join(staging, entries[0])).isDirectory()) {
    fail(`Expected ${archive} to contain one root directory.`);
  }
  renameSync(join(staging, entries[0]), destination);
  rmSync(staging, { recursive: true, force: true });
  if (!existsSync(join(destination, expectedExecutable))) {
    fail(`${archive} did not contain ${expectedExecutable}.`);
  }
}

function prepareSource(destination) {
  const revision = manifest.upstream.revision;
  if (!existsSync(join(destination, ".git"))) {
    if (offline) fail("Offline bootstrap is missing the pinned LLVM checkout.");
    mkdirSync(dirname(destination), { recursive: true });
    const staging = `${destination}.stage-${process.pid}`;
    rmSync(staging, { recursive: true, force: true });
    run("git", [
      "clone",
      "--filter=blob:none",
      "--depth=1",
      "--branch=llvmorg-22.1.0+wasm",
      manifest.upstream.url,
      staging,
    ]);
    renameSync(staging, destination);
  }
  const actual = run("git", ["rev-parse", "HEAD"], {
    cwd: destination,
    capture: true,
  });
  if (actual !== revision) {
    fail(`LLVM checkout mismatch: expected ${revision}, got ${actual}.`);
  }
}

function platformKey() {
  if (!["darwin", "linux"].includes(process.platform)) {
    fail(`Unsupported TraceCC build host: ${process.platform}-${process.arch}.`);
  }
  const architecture =
    process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : undefined;
  if (!architecture) fail(`Unsupported TraceCC build architecture: ${process.arch}.`);
  return `${process.platform}-${architecture}`;
}

const platform = platformKey();
mkdirSync(toolchainRoot, { recursive: true });
const buildRoot = buildPathFor(toolchainRoot);
const downloads = join(toolchainRoot, "downloads");
const wasiArtifact = manifest.buildInputs.distributions.wasiSdk.platforms[platform];
const binaryenArtifact = manifest.buildInputs.distributions.binaryen.platforms[platform];
if (!wasiArtifact || !binaryenArtifact) {
  fail(`No frozen toolchain distributions for ${platform}.`);
}

const wasiArchive = join(downloads, wasiArtifact.archive);
const binaryenArchive = join(downloads, binaryenArtifact.archive);
await download(wasiArtifact, wasiArchive);
await download(binaryenArtifact, binaryenArchive);

const wasiSdk = join(buildRoot, "wasi-sdk-29.0");
const binaryen = join(buildRoot, "binaryen-version_131");
extractArchive(wasiArchive, wasiSdk, "bin/clang");
extractArchive(binaryenArchive, binaryen, "bin/wasm-opt");

const source = join(buildRoot, "llvm-project");
prepareSource(source);

const profile = join(buildRoot, "tracecc-v9r1.profdata");
const profileBytes = gunzipSync(
  readFileSync(join(repoRoot, "source", "tracecc-v9r1.profdata.gz")),
);
if (
  createHash("sha256").update(profileBytes).digest("hex") !==
  manifest.buildInputs.pgo.profileSha256
) {
  fail("Packaged TraceCC PGO profile does not match the frozen manifest.");
}
writeFileSync(profile, profileBytes);

const environment = {
  ...process.env,
  TRACECC_SOURCE_DIR: source,
  TRACECC_BUILD_DIR: join(buildRoot, "build"),
  TRACECC_WASI_SDK: wasiSdk,
  TRACECC_PGO_PROFILE: profile,
  TRACECC_PGO_LIST: join(repoRoot, "source", "tracecc-use-clang.list"),
  TRACECC_WASM_OPT: join(binaryen, "bin", "wasm-opt"),
};

if (shouldBuild) {
  run("bash", [join(repoRoot, "scripts", "build-toolchain.sh")], {
    env: environment,
  });
}

console.log(
  JSON.stringify(
    {
      platform,
      root: toolchainRoot,
      buildRoot,
      source,
      wasiSdk,
      wasmOpt: environment.TRACECC_WASM_OPT,
      profile,
      buildDirectory: environment.TRACECC_BUILD_DIR,
      built: shouldBuild,
    },
    null,
    2,
  ),
);
