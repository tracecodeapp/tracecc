import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const verifier = join(import.meta.dirname, "../scripts/verify-toolchain-release.mjs");

function verify(directory) {
  return spawnSync(process.execPath, [verifier], {
    encoding: "utf8",
    env: { ...process.env, TRACECC_RELEASE_DIR: directory },
  });
}

function withFixture(run) {
  const parent = mkdtempSync(join(tmpdir(), "tracecc-verifier-"));
  const release = join(parent, "release");
  try {
    writeFileSync(join(parent, "outside.wasm"), "outside");
    mkdirSync(release);
    run({ parent, release });
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

test("release verification rejects artifact traversal before reading it", () => {
  withFixture(({ release }) => {
    writeFileSync(join(release, "release.json"), JSON.stringify({
      protocolVersion: "tracecc-toolchain-release-v1",
      artifacts: { reactor: { path: "../outside.wasm" } },
    }));
    const result = verify(release);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid reactor artifact path/);
  });
});

test("release verification rejects symlinked artifacts", () => {
  withFixture(({ parent, release }) => {
    symlinkSync(join(parent, "outside.wasm"), join(release, "reactor.wasm"));
    writeFileSync(join(release, "release.json"), JSON.stringify({
      protocolVersion: "tracecc-toolchain-release-v1",
      artifacts: { reactor: { path: "reactor.wasm" } },
    }));
    const result = verify(release);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /cannot contain symlinks/);
  });
});
