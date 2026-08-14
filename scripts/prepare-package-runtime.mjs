#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const TRACECC_PACKAGE_RUNTIME_SCHEMA = "tracecc-package-runtime-v2";

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
const TRACECC_CONSUMER_RELEASE_FORMAT = "tracecc-consumer-release-v2";
const TRACECC_CONSUMER_HASH_ALGORITHM =
  "sha256-canonical-json-tracecc-consumer-release-v2";
const TRACECC_CONSUMER_LOCK_SCHEMA = "tracecc-consumer-lock-v2";
const TRACECC_RUNTIME_MANIFEST_SCHEMA = "tracecc-runtime-assets-v2";
const TRACECC_TOOLCHAIN_RELEASE_PROTOCOL = "tracecc-toolchain-release-v1";
const TRACECC_TOOLCHAIN_ARTIFACTS = Object.freeze({
  reactor: "tracecc-reactor.wasm",
  resources: "llvm-resources.tar",
});
const TRACECC_TOOLCHAIN_PATCH_PATH = fileURLToPath(
  new URL("../toolchain/patches/tracecc-v9.patch", import.meta.url),
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function integrityFromSha256(digest) {
  if (!/^[0-9a-f]{64}$/u.test(digest ?? "")) {
    throw new Error(
      `TraceCC consumer lock contains an invalid SHA-256 digest: ${String(digest)}.`,
    );
  }
  return `sha256-${Buffer.from(digest, "hex").toString("base64")}`;
}

function recomputeConsumerHash(lock) {
  if (
    lock?.consumerHashAlgorithm !== TRACECC_CONSUMER_HASH_ALGORITHM ||
    !/^[0-9a-f]{64}$/u.test(lock?.toolchain?.contentHash ?? "")
  ) {
    throw new Error(
      `TraceCC consumer lock must use ${TRACECC_CONSUMER_HASH_ALGORITHM} with a valid toolchain content hash.`,
    );
  }
  return sha256(
    Buffer.from(
      JSON.stringify({
        format: TRACECC_CONSUMER_RELEASE_FORMAT,
        toolchainContentHash: lock.toolchain.contentHash,
        files: lock.files.map(({ path, size, sha256: digest, mediaType }) => ({
          path,
          size,
          sha256: digest,
          mediaType,
        })),
      }),
    ),
  );
}

function recomputeToolchainContentHash(lockFiles) {
  const reactor = lockFiles.get(TRACECC_TOOLCHAIN_ARTIFACTS.reactor);
  const resources = lockFiles.get(TRACECC_TOOLCHAIN_ARTIFACTS.resources);
  if (!reactor || !resources) {
    throw new Error("TraceCC consumer lock is missing base toolchain artifacts.");
  }
  return createHash("sha256")
    .update(reactor.sha256)
    .update(resources.sha256)
    .update(sha256(readFileSync(TRACECC_TOOLCHAIN_PATCH_PATH)))
    .digest("hex");
}

function validateConsumerLock(lock) {
  const declaredFiles = Array.isArray(lock?.files) ? lock.files : [];
  const lockFiles = new Map();
  for (const file of declaredFiles) {
    if (
      typeof file?.path !== "string" ||
      file.path.length === 0 ||
      file.path.startsWith("/") ||
      file.path.split("/").includes("..") ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      typeof file.mediaType !== "string" ||
      file.mediaType.length === 0 ||
      file.integrity !== integrityFromSha256(file.sha256) ||
      lockFiles.has(file.path)
    ) {
      throw new Error(`TraceCC consumer lock entry is invalid: ${String(file?.path)}.`);
    }
    lockFiles.set(file.path, file);
  }
  if (
    lock?.schema !== TRACECC_CONSUMER_LOCK_SCHEMA ||
    !/^[0-9a-f]{64}$/u.test(lock?.consumerHash ?? "") ||
    declaredFiles.length === 0 ||
    recomputeConsumerHash(lock) !== lock.consumerHash
  ) {
    throw new Error("TraceCC consumer lock identity does not match its ordered runtime files.");
  }
  const toolchainArtifacts = lock?.toolchain?.artifacts;
  if (
    lock.toolchain.protocolVersion !== TRACECC_TOOLCHAIN_RELEASE_PROTOCOL ||
    !toolchainArtifacts ||
    Object.keys(toolchainArtifacts).length !==
      Object.keys(TRACECC_TOOLCHAIN_ARTIFACTS).length
  ) {
    throw new Error("TraceCC consumer lock contains an invalid base toolchain descriptor.");
  }
  for (const [role, expectedPath] of Object.entries(TRACECC_TOOLCHAIN_ARTIFACTS)) {
    const artifact = toolchainArtifacts[role];
    const file = lockFiles.get(expectedPath);
    if (
      !file ||
      artifact?.path !== file.path ||
      artifact?.bytes !== file.size ||
      artifact?.sha256 !== file.sha256 ||
      artifact?.integrity !== file.integrity ||
      artifact?.mediaType !== file.mediaType
    ) {
      throw new Error(
        `TraceCC consumer lock toolchain ${role} does not match ${expectedPath}.`,
      );
    }
  }
  if (lock.toolchain.contentHash !== recomputeToolchainContentHash(lockFiles)) {
    throw new Error(
      "TraceCC consumer lock base toolchain content hash does not match the reactor, resources, and packaged patch.",
    );
  }
  return lockFiles;
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
  const lockFiles = validateConsumerLock(lock);
  if (
    manifest?.schema !== TRACECC_RUNTIME_MANIFEST_SCHEMA ||
    manifest?.runtime !== "tracecc" ||
    manifest?.runtimeVersion !== `tracecc-${consumerHash.slice(0, 12)}` ||
    manifest?.contentHash !== consumerHash
  ) {
    throw new Error(
      `TraceCC package runtime identity is invalid: expected a content-addressed consumer release at ${directory}.`,
    );
  }

  assertExactKeys(
    manifest.assets,
    [...Object.keys(TRACECC_MANIFEST_ASSETS), "compilerResources"],
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

export function validateTraceCCPackageRuntimeDirectory(directory, options = {}) {
  const manifest = JSON.parse(
    readFileSync(join(directory, "tracecc-runtime-manifest.json"), "utf8"),
  );
  const lock = JSON.parse(
    readFileSync(join(directory, "tracecc-consumer-lock.json"), "utf8"),
  );
  const consumerHash = lock.consumerHash;
  if (options.expectedDirectoryName !== false && basename(directory) !== consumerHash) {
    throw new Error(
      `TraceCC package runtime identity is invalid: expected a content-addressed consumer release at ${directory}.`,
    );
  }
  validateTraceCCRuntimeManifest(manifest, lock, directory);

  const files = listFiles(directory);
  const runtimeFiles = [];
  const declared = validateConsumerLock(lock);
  for (const file of files) {
    const bytes = readFileSync(file.absolute);
    const digest = sha256(bytes);
    runtimeFiles.push({
      path: file.path,
      size: bytes.byteLength,
      sha256: digest,
    });
    if (
      file.path === "tracecc-runtime-manifest.json" ||
      file.path === "tracecc-consumer-lock.json"
    ) {
      continue;
    }
    const expected = declared.get(file.path);
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
  return {
    consumerHash,
    lock,
    manifest,
    files: runtimeFiles,
  };
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
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const packageRoot = join(root, "runtime-release");
  const resolvedSource = realpathSync(source);
  const resolvedPackageRoot = realpathSync(packageRoot);
  const sourceFromPackageRoot = relative(resolvedPackageRoot, resolvedSource);
  if (
    sourceFromPackageRoot === "" ||
    (!isAbsolute(sourceFromPackageRoot) &&
      !sourceFromPackageRoot.startsWith(`..${sep}`) &&
      sourceFromPackageRoot !== "..")
  ) {
    throw new Error(
      `TraceCC consumer release must be outside the package runtime directory before preparation: ${source}.`,
    );
  }
  const { consumerHash } = validateTraceCCPackageRuntimeDirectory(resolvedSource);
  const target = join(packageRoot, consumerHash);
  rmSync(packageRoot, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(resolvedSource, target, { recursive: true, dereference: false });

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
    targetPath: `tracecc/${consumerHash}`,
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
