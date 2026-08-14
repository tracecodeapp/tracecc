import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  prepareTraceCCPackageRuntime,
  validateTraceCCRuntimeManifest,
} from "../scripts/prepare-package-runtime.mjs";

const root = join(import.meta.dirname, "..");
const packageManifest = JSON.parse(
  readFileSync(join(root, "runtime-release", "manifest.json"), "utf8"),
);
const releaseRoot = join(root, "runtime-release", packageManifest.consumerHash);
const manifest = JSON.parse(
  readFileSync(join(releaseRoot, "tracecc-runtime-manifest.json"), "utf8"),
);
const lock = JSON.parse(
  readFileSync(join(releaseRoot, "tracecc-consumer-lock.json"), "utf8"),
);

test("runtime manifest descriptors exactly match the consumer lock", () => {
  assert.doesNotThrow(() => validateTraceCCRuntimeManifest(manifest, lock, releaseRoot));
  assert.equal(manifest.schema, "tracecc-runtime-assets-v2");
  assert.equal(manifest.contentHash, lock.consumerHash);
  assert.equal("assetBaseUrl" in manifest, false);
  assert.equal("worker" in manifest.assets, false);

  const staleIntegrity = structuredClone(manifest);
  staleIntegrity.assets.compilerWasm.integrity = "sha256-stale";
  assert.throws(
    () => validateTraceCCRuntimeManifest(staleIntegrity, lock, releaseRoot),
    /compilerWasm does not match lock entry tracecc-reactor\.wasm/u,
  );

  const wrongRole = structuredClone(manifest);
  wrongRole.assets.runtimeHeader = structuredClone(manifest.assets.sysroot);
  assert.throws(
    () => validateTraceCCRuntimeManifest(wrongRole, lock, releaseRoot),
    /runtimeHeader does not match lock entry tracecode_runtime\.hpp/u,
  );

  const missingResource = structuredClone(manifest);
  delete missingResource.assets.compilerResources["tracecc-map-runtime-object"];
  assert.throws(
    () => validateTraceCCRuntimeManifest(missingResource, lock, releaseRoot),
    /compiler resources must contain exactly/u,
  );
});

test("consumer lock derives integrity and identity from ordered file digests", () => {
  const staleIntegrityLock = structuredClone(lock);
  staleIntegrityLock.files[0].integrity = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const staleIntegrityManifest = structuredClone(manifest);
  staleIntegrityManifest.assets.compilerWasm.integrity = staleIntegrityLock.files[0].integrity;
  staleIntegrityManifest.assets.linkerWasm.integrity = staleIntegrityLock.files[0].integrity;
  assert.throws(
    () => validateTraceCCRuntimeManifest(staleIntegrityManifest, staleIntegrityLock, releaseRoot),
    /consumer lock entry is invalid/u,
  );

  const staleConsumerHash = structuredClone(lock);
  staleConsumerHash.files[0].sha256 = "0".repeat(64);
  staleConsumerHash.files[0].integrity =
    "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  assert.throws(
    () => validateTraceCCRuntimeManifest(manifest, staleConsumerHash, releaseRoot),
    /consumer lock identity does not match its ordered runtime files/u,
  );

  const staleToolchainProtocol = structuredClone(lock);
  staleToolchainProtocol.toolchain.protocolVersion = "tracecc-toolchain-release-v0";
  assert.throws(
    () => validateTraceCCRuntimeManifest(manifest, staleToolchainProtocol, releaseRoot),
    /invalid base toolchain descriptor/u,
  );

  const mismatchedReactor = structuredClone(lock);
  mismatchedReactor.toolchain.artifacts.reactor.sha256 = "0".repeat(64);
  assert.throws(
    () => validateTraceCCRuntimeManifest(manifest, mismatchedReactor, releaseRoot),
    /toolchain reactor does not match tracecc-reactor\.wasm/u,
  );

  const staleToolchainHash = structuredClone(lock);
  staleToolchainHash.toolchain.contentHash = "0".repeat(64);
  staleToolchainHash.consumerHash = createHash("sha256")
    .update(JSON.stringify({
      format: "tracecc-consumer-release-v2",
      toolchainContentHash: staleToolchainHash.toolchain.contentHash,
      files: staleToolchainHash.files.map(
        ({ path, size, sha256: digest, mediaType }) => ({
          path,
          size,
          sha256: digest,
          mediaType,
        }),
      ),
    }))
    .digest("hex");
  assert.throws(
    () => validateTraceCCRuntimeManifest(manifest, staleToolchainHash, releaseRoot),
    /base toolchain content hash does not match/u,
  );

  const staleReleaseFormat = structuredClone(lock);
  staleReleaseFormat.schema = "tracecc-consumer-lock-v1";
  assert.throws(
    () => validateTraceCCRuntimeManifest(manifest, staleReleaseFormat, releaseRoot),
    /consumer lock identity does not match/u,
  );

  const renamedFile = structuredClone(lock);
  renamedFile.files[2].path = "renamed-runtime-header.hpp";
  assert.throws(
    () => validateTraceCCRuntimeManifest(manifest, renamedFile, releaseRoot),
    /consumer lock identity does not match/u,
  );
});

test("package preparation rejects a source inside its destination tree", () => {
  assert.throws(
    () => prepareTraceCCPackageRuntime({ root, source: releaseRoot }),
    /must be outside the package runtime directory/u,
  );
});

test("package preparation resolves symlinks before clearing its destination", () => {
  const directory = mkdtempSync(join(tmpdir(), "tracecc-package-source-"));
  const source = join(directory, "external-release");
  symlinkSync(releaseRoot, source, "dir");
  try {
    assert.throws(
      () => prepareTraceCCPackageRuntime({ root, source }),
      /must be outside the package runtime directory/u,
    );
    assert.doesNotThrow(() => readFileSync(join(releaseRoot, "tracecc-consumer-lock.json")));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
