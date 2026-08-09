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

function validateSource(directory) {
  const manifest = JSON.parse(
    readFileSync(join(directory, "cpp-runtime-manifest.json"), "utf8"),
  );
  const lock = JSON.parse(
    readFileSync(join(directory, "tracecc-consumer-lock.json"), "utf8"),
  );
  const consumerHash = lock.consumerHash;
  if (
    lock.schema !== "tracecode.tracecc-consumer-lock.v1" ||
    !/^[0-9a-f]{64}$/u.test(consumerHash ?? "") ||
    basename(directory) !== consumerHash ||
    manifest.protocolVersion !== "browser-runtime-assets-v1" ||
    manifest.runtime !== "cpp" ||
    !String(manifest.assetBaseUrl ?? "").endsWith(`/${consumerHash}/`)
  ) {
    throw new Error(
      `TraceCC package runtime identity is invalid: expected a content-addressed consumer release at ${directory}.`,
    );
  }

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
