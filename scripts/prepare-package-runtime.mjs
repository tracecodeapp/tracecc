#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const TRACECC_PACKAGE_RUNTIME_SCHEMA = "tracecc-package-runtime-v1";

const TRACECC_MANIFEST_ASSETS = Object.freeze({
  runtimeHeader: "tracecode_runtime.hpp",
  compilerWasm: "tracecc-reactor.wasm",
  linkerWasm: "tracecc-reactor.wasm",
  sysroot: "llvm-resources.tar",
});
const TRACECC_MANIFEST_RESOURCES = Object.freeze({
  "tracecc-narrow-pch": "narrow.pch",
  "tracecc-narrow-pch-source": "narrow.source.hpp",
  "tracecc-narrow-runtime-object": "narrow.o",
  "tracecc-broad-pch": "broad.pch",
  "tracecc-broad-pch-source": "broad.source.hpp",
  "tracecc-broad-runtime-object": "broad.o",
  "tracecc-map-pch": "map.pch",
  "tracecc-map-pch-source": "map.source.hpp",
  "tracecc-map-runtime-object": "map.o",
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function listFiles(directory, base = directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`TraceCC runtime packages cannot contain symlinks: ${absolute}`);
      }
      if (entry.isDirectory()) return listFiles(absolute, base);
      if (!entry.isFile()) {
        throw new Error(`TraceCC runtime packages cannot contain special files: ${absolute}`);
      }
      return [{
        absolute,
        path: relative(base, absolute).split(sep).join("/"),
      }];
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function assertExactKeys(value, expected, label) {
  const actual = value && typeof value === "object" ? Object.keys(value).sort() : [];
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(
      `TraceCC runtime manifest ${label} must contain exactly: ${wanted.join(", ")}.`,
    );
  }
}

function validateAssetDescriptor(label, descriptor, expectedPath, lockFiles) {
  const expected = lockFiles.get(expectedPath);
  if (
    !expected ||
    descriptor?.url !== expectedPath ||
    descriptor?.size !== expected.size ||
    descriptor?.integrity !== expected.integrity ||
    descriptor?.mediaType !== expected.mediaType ||
    descriptor?.delivery?.mutability !== "immutable" ||
    descriptor?.delivery?.address !== "content"
  ) {
    throw new Error(
      `TraceCC runtime manifest ${label} does not match lock entry ${expectedPath}.`,
    );
  }
}

export function validateTraceCCRuntimeManifest(manifest, lock, directory = "runtime release") {
  const consumerHash = lock?.consumerHash;
  const declaredFiles = Array.isArray(lock?.files) ? lock.files : [];
  const lockFiles = new Map(declaredFiles.map((file) => [file.path, file]));
  if (
    lock?.schema !== "tracecode.tracecc-consumer-lock.v1" ||
    !/^[0-9a-f]{64}$/u.test(consumerHash ?? "") ||
    lockFiles.size !== declaredFiles.length ||
    manifest?.protocolVersion !== "browser-runtime-assets-v1" ||
    manifest?.runtime !== "cpp" ||
    manifest?.runtimeVersion !== `tracecc-${consumerHash.slice(0, 12)}` ||
    manifest?.assetBaseUrl !== `/workers/cpp/tracecc/${consumerHash}/` ||
    manifest?.workerFormat !== "module" ||
    manifest?.assets?.worker?.url !== "/workers/cpp-worker.js"
  ) {
    throw new Error(
      `TraceCC package runtime identity is invalid: expected a content-addressed consumer release at ${directory}.`,
    );
  }

  assertExactKeys(
    manifest.assets,
    ["worker", ...Object.keys(TRACECC_MANIFEST_ASSETS), "compilerResources"],
    "assets",
  );
  assertExactKeys(
    manifest.assets.compilerResources,
    Object.keys(TRACECC_MANIFEST_RESOURCES),
    "compiler resources",
  );
  for (const [role, expectedPath] of Object.entries(TRACECC_MANIFEST_ASSETS)) {
    validateAssetDescriptor(role, manifest.assets[role], expectedPath, lockFiles);
  }
  for (const [role, expectedPath] of Object.entries(TRACECC_MANIFEST_RESOURCES)) {
    validateAssetDescriptor(
      `compilerResources.${role}`,
      manifest.assets.compilerResources[role],
      expectedPath,
      lockFiles,
    );
  }
}

function validateSource(directory) {
  const manifest = JSON.parse(
    readFileSync(join(directory, "cpp-runtime-manifest.json"), "utf8"),
  );
  const lock = JSON.parse(
    readFileSync(join(directory, "tracecc-consumer-lock.json"), "utf8"),
  );
  const consumerHash = lock.consumerHash;
  if (basename(directory) !== consumerHash) {
    throw new Error(
      `TraceCC package runtime identity is invalid: expected a content-addressed consumer release at ${directory}.`,
    );
  }
  validateTraceCCRuntimeManifest(manifest, lock, directory);

  const declared = new Map(lock.files.map((file) => [file.path, file]));
  for (const file of listFiles(directory)) {
    if (file.path === "cpp-runtime-manifest.json" || file.path === "tracecc-consumer-lock.json") {
      continue;
    }
    const expected = declared.get(file.path);
    const bytes = readFileSync(file.absolute);
    const digest = sha256(bytes);
    if (!expected || expected.size !== bytes.byteLength || expected.sha256 !== digest) {
      throw new Error(
        `TraceCC package runtime mismatch for ${file.path}: expected ` +
          `${String(expected?.size)}/${String(expected?.sha256)}, received ` +
          `${bytes.byteLength}/${digest}.`,
      );
    }
    declared.delete(file.path);
  }
  if (declared.size > 0) {
    throw new Error(
      `TraceCC package runtime is missing declared files: ${[...declared.keys()].join(", ")}.`,
    );
  }
  return { consumerHash, lock, manifest };
}

export function prepareTraceCCPackageRuntime(options = {}) {
  const root = options.root ?? join(import.meta.dirname, "..");
  const source = resolve(
    options.source ?? process.env.TRACECC_CONSUMER_RELEASE_DIR ?? "",
  );
  if (!process.env.TRACECC_CONSUMER_RELEASE_DIR && !options.source) {
    throw new Error(
      "TRACECC_CONSUMER_RELEASE_DIR is required to prepare the TraceCC npm runtime.",
    );
  }
  if (!statSync(source).isDirectory()) {
    throw new Error(`TraceCC consumer release is not a directory: ${source}`);
  }
  const { consumerHash } = validateSource(source);
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const packageRoot = join(root, "runtime-release");
  const target = join(packageRoot, consumerHash);
  rmSync(packageRoot, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true, dereference: false });

  const files = listFiles(target).map((file) => {
    const bytes = readFileSync(file.absolute);
    return {
      path: file.path,
      size: bytes.byteLength,
      sha256: sha256(bytes),
    };
  });
  const manifest = {
    schema: TRACECC_PACKAGE_RUNTIME_SCHEMA,
    package: { name: packageJson.name, version: packageJson.version },
    releaseId: `tracecc@${packageJson.version}+sha256.${consumerHash}`,
    consumerHash,
    targetPath: `cpp/tracecc/${consumerHash}`,
    files,
  };
  writeFileSync(
    join(packageRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const manifest = prepareTraceCCPackageRuntime();
    console.log(
      `Prepared ${manifest.releaseId} for npm (${manifest.files.length} files).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
