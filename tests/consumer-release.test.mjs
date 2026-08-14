import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const packageRuntime = JSON.parse(
  readFileSync(join(root, "runtime-release", "manifest.json"), "utf8"),
);
const packageRuntimeRoot = join(
  root,
  "runtime-release",
  packageRuntime.consumerHash,
);
const sourceManifest = JSON.parse(
  readFileSync(join(root, "toolchain", "manifest.json"), "utf8"),
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function identity(bytes) {
  const digest = sha256(bytes);
  return {
    bytes: bytes.byteLength,
    sha256: digest,
    integrity: `sha256-${Buffer.from(digest, "hex").toString("base64")}`,
  };
}

test("consumer release assembly is deterministic and repository-owned", () => {
  const temporary = mkdtempSync(join(tmpdir(), "tracecc-consumer-release-"));
  const toolchain = join(temporary, "toolchain");
  const pch = join(temporary, "pch");
  const output = join(temporary, "output");
  const header = join(temporary, "tracecode_runtime.hpp");
  const headerBytes = Buffer.from("#pragma once\n");
  const patch = readFileSync(join(root, "toolchain", "patches", "tracecc-v9.patch"));
  const reactor = readFileSync(join(packageRuntimeRoot, "tracecc-reactor.wasm"));
  const resources = readFileSync(join(packageRuntimeRoot, "llvm-resources.tar"));
  const reactorIdentity = identity(reactor);
  const resourcesIdentity = identity(resources);
  const patchIdentity = identity(patch);
  const contentHash = createHash("sha256")
    .update(reactorIdentity.sha256)
    .update(resourcesIdentity.sha256)
    .update(patchIdentity.sha256)
    .digest("hex");

  try {
    mkdirSync(join(toolchain, "source"), { recursive: true });
    mkdirSync(join(toolchain, "legal"), { recursive: true });
    mkdirSync(pch, { recursive: true });
    copyFileSync(
      join(packageRuntimeRoot, "tracecc-reactor.wasm"),
      join(toolchain, "tracecc-reactor.wasm"),
    );
    copyFileSync(
      join(packageRuntimeRoot, "llvm-resources.tar"),
      join(toolchain, "llvm-resources.tar"),
    );
    copyFileSync(
      join(root, "toolchain", "patches", "tracecc-v9.patch"),
      join(toolchain, "source", "tracecc.patch"),
    );
    for (const path of [
      "source/manifest.json",
      "source/build-toolchain.sh",
      "source/Toolchain-WASI-LLVM.cmake",
      "legal/LLVM-LICENSE.TXT",
      "legal/THIRD_PARTY_NOTICES.md",
      "legal/CORRESPONDING_SOURCE.md",
    ]) {
      writeFileSync(join(toolchain, path), `${path}\n`);
    }
    writeFileSync(
      join(toolchain, "release.json"),
      `${JSON.stringify({
        protocolVersion: "tracecc-toolchain-release-v1",
        toolchainVersion: "test",
        contentHash,
        artifacts: {
          reactor: {
            path: "tracecc-reactor.wasm",
            ...reactorIdentity,
            mediaType: "application/wasm",
          },
          resources: {
            path: "llvm-resources.tar",
            ...resourcesIdentity,
            mediaType: "application/x-tar",
          },
        },
        source: { patchSha256: patchIdentity.sha256 },
      }, null, 2)}\n`,
    );
    writeFileSync(header, headerBytes);
    const headerIdentity = identity(headerBytes);
    const anchors = {
      narrow: { common: true, corpus: false, map: false },
      broad: { common: false, corpus: true, map: false },
      map: { common: false, corpus: false, map: true },
    };
    for (const profile of ["narrow", "broad", "map"]) {
      const pchBytes = Buffer.from(`${profile} pch`);
      const sourceBytes = Buffer.from(`${profile} source`);
      const objectBytes = Buffer.from(`${profile} object`);
      const pchIdentity = identity(pchBytes);
      const sourceIdentity = identity(sourceBytes);
      const objectIdentity = identity(objectBytes);
      writeFileSync(join(pch, `${profile}.pch`), pchBytes);
      writeFileSync(join(pch, `${profile}.pch.source.hpp`), sourceBytes);
      writeFileSync(join(pch, `${profile}.o`), objectBytes);
      writeFileSync(
        join(pch, `${profile}.pch.json`),
        `${JSON.stringify({
          compilerVersion: sourceManifest.buildInputs.pchCompiler.version,
          compilerSha256: sourceManifest.buildInputs.pchCompiler.wasmSha256,
          compilerBundleSha256:
            sourceManifest.buildInputs.pchCompiler.bundleSha256,
          runtimeHeaderSha256: headerIdentity.sha256,
          pchSourceSha256: sourceIdentity.sha256,
          languageStandard: "c++23",
          flags: [
            "-O0",
            "-fno-exceptions",
            "-fpch-instantiate-templates",
            "-fpch-codegen",
          ],
          instantiateTemplates: true,
          commonTypeAnchors: anchors[profile].common,
          corpusTypeAnchors: anchors[profile].corpus,
          mapTypeAnchors: anchors[profile].map,
          bytes: pchIdentity.bytes,
          sha256: pchIdentity.sha256,
        }, null, 2)}\n`,
      );
      writeFileSync(
        join(pch, `${profile}.o.json`),
        `${JSON.stringify({
          compilerVersion: sourceManifest.buildInputs.pchCompiler.version,
          compilerSha256: sourceManifest.buildInputs.pchCompiler.wasmSha256,
          compilerBundleSha256:
            sourceManifest.buildInputs.pchCompiler.bundleSha256,
          runtimeHeaderSha256: headerIdentity.sha256,
          pchSourceSha256: sourceIdentity.sha256,
          pchSha256: pchIdentity.sha256,
          bytes: objectIdentity.bytes,
          sha256: objectIdentity.sha256,
        }, null, 2)}\n`,
      );
    }

    const environment = {
      ...process.env,
      TRACECC_TOOLCHAIN_RELEASE_DIR: toolchain,
      TRACECC_PCH_DIR: pch,
      TRACECC_RUNTIME_HEADER: header,
      TRACECC_CONSUMER_RELEASE_ROOT: output,
    };
    const first = spawnSync(
      process.execPath,
      [join(root, "scripts", "prepare-consumer-release.mjs")],
      { cwd: root, env: environment, encoding: "utf8" },
    );
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const firstResult = JSON.parse(first.stdout);
    const firstLock = readFileSync(
      join(firstResult.outputDirectory, "tracecc-consumer-lock.json"),
      "utf8",
    );

    const second = spawnSync(
      process.execPath,
      [join(root, "scripts", "prepare-consumer-release.mjs")],
      { cwd: root, env: environment, encoding: "utf8" },
    );
    assert.equal(second.status, 0, second.stderr || second.stdout);
    const secondResult = JSON.parse(second.stdout);
    assert.equal(secondResult.consumerHash, firstResult.consumerHash);
    assert.equal(
      readFileSync(
        join(secondResult.outputDirectory, "tracecc-consumer-lock.json"),
        "utf8",
      ),
      firstLock,
    );

    const staleProvenance = JSON.parse(
      readFileSync(join(pch, "broad.pch.json"), "utf8"),
    );
    staleProvenance.runtimeHeaderSha256 = "0".repeat(64);
    writeFileSync(
      join(pch, "broad.pch.json"),
      `${JSON.stringify(staleProvenance, null, 2)}\n`,
    );
    const rejected = spawnSync(
      process.execPath,
      [join(root, "scripts", "prepare-consumer-release.mjs")],
      { cwd: root, env: environment, encoding: "utf8" },
    );
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /broad PCH\/runtime-object provenance/u);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
