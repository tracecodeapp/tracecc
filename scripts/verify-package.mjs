#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { validateTraceCCPackageRuntimeDirectory } from "./prepare-package-runtime.mjs";

const root = join(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const license = readFileSync(join(root, "LICENSE"), "utf8");
const llvmLicense = readFileSync(
  join(root, "legal", "LLVM-LICENSE.TXT"),
  "utf8",
);
assert.equal(packageJson.license, "AGPL-3.0-only");
assert.match(license, /GNU AFFERO GENERAL PUBLIC LICENSE/u);
assert.match(license, /Version 3, 19 November 2007/u);
assert.match(license, /END OF TERMS AND CONDITIONS/u);
assert.match(llvmLicense, /Apache License v2\.0 with LLVM Exceptions/u);
assert.match(llvmLicense, /LLVM Exceptions to the Apache 2\.0 License/u);
const runtime = JSON.parse(
  readFileSync(join(root, "runtime-release", "manifest.json"), "utf8"),
);
assert.equal(runtime.schema, "tracecc-package-runtime-v2");
assert.deepEqual(runtime.package, {
  name: packageJson.name,
  version: packageJson.version,
});
assert.equal(
  runtime.releaseId,
  `tracecc@${packageJson.version}+sha256.${runtime.consumerHash}`,
  "The package release identifier must be derived from its immutable runtime identity.",
);
assert.equal(runtime.targetPath, `tracecc/${runtime.consumerHash}`);
assert.ok(runtime.files.length > 0);
const runtimeRoot = join(root, "runtime-release", runtime.consumerHash);
const validatedRuntime = validateTraceCCPackageRuntimeDirectory(runtimeRoot);
assert.deepEqual(
  runtime.files,
  validatedRuntime.files,
  "TraceCC package manifest must inventory every runtime file",
);

for (const file of runtime.files) {
  const bytes = readFileSync(
    join(runtimeRoot, ...file.path.split("/")),
  );
  assert.equal(bytes.byteLength, file.size, `${file.path} byte size drifted`);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    file.sha256,
    `${file.path} digest drifted`,
  );
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const packed = spawnSync(npm, ["pack", "--ignore-scripts", "--dry-run", "--json"], {
  cwd: root,
  encoding: "utf8",
});
if (packed.error) throw packed.error;
if (packed.status !== 0) throw new Error(packed.stderr || packed.stdout);
const [report] = JSON.parse(packed.stdout);
const paths = new Set(report.files.map((file) => file.path));
for (const file of runtime.files) {
  assert.ok(
    paths.has(`runtime-release/${runtime.consumerHash}/${file.path}`),
    `Packed TraceCC runtime is missing ${file.path}`,
  );
}
assert.ok(paths.has("runtime-release/manifest.json"));
assert.ok(paths.has("LICENSE"));
assert.ok(paths.has("legal/LLVM-LICENSE.TXT"));
for (const sourcePath of [
  "legal/CORRESPONDING_SOURCE.md",
  "scripts/build-toolchain.sh",
  "scripts/bootstrap-toolchain.mjs",
  "scripts/prepare-consumer-release.mjs",
  "scripts/prepare-package-runtime.mjs",
  "scripts/verify-toolchain-release.mjs",
  "runtime/tracecode_runtime.hpp",
  "source/README.md",
  "source/tracecc-use-clang.list",
  "source/tracecc-v9r1.profdata.gz",
  "toolchain/Toolchain-WASI-LLVM.cmake",
  "toolchain/manifest.json",
  "toolchain/patches/tracecc-v9.patch",
]) {
  assert.ok(paths.has(sourcePath), `Packed TraceCC source is missing ${sourcePath}`);
}
const sourceManifest = JSON.parse(
  readFileSync(join(root, "toolchain", "manifest.json"), "utf8"),
);
const profile = gunzipSync(
  readFileSync(join(root, "source", "tracecc-v9r1.profdata.gz")),
);
assert.equal(
  createHash("sha256").update(profile).digest("hex"),
  sourceManifest.buildInputs.pgo.profileSha256,
  "The packaged PGO profile must match the frozen build manifest.",
);
assert.equal(
  createHash("sha256")
    .update(readFileSync(join(root, "source", "tracecc-use-clang.list")))
    .digest("hex"),
  sourceManifest.buildInputs.pgo.profileListSha256,
  "The packaged PGO profile list must match the frozen build manifest.",
);
assert.ok(report.unpackedSize < 180_000_000);
console.log(
  `PASS: ${report.id} packs ${report.files.length} files (${report.size} bytes compressed) with ${runtime.releaseId}.`,
);
