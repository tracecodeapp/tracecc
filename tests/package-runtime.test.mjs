import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { validateTraceCCRuntimeManifest } from "../scripts/prepare-package-runtime.mjs";

const root = join(import.meta.dirname, "..");
const packageManifest = JSON.parse(
  readFileSync(join(root, "runtime-release", "manifest.json"), "utf8"),
);
const releaseRoot = join(root, "runtime-release", packageManifest.consumerHash);
const manifest = JSON.parse(
  readFileSync(join(releaseRoot, "cpp-runtime-manifest.json"), "utf8"),
);
const lock = JSON.parse(
  readFileSync(join(releaseRoot, "tracecc-consumer-lock.json"), "utf8"),
);

test("runtime manifest descriptors exactly match the consumer lock", () => {
  assert.doesNotThrow(() => validateTraceCCRuntimeManifest(manifest, lock, releaseRoot));

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
