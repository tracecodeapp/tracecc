#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const license = readFileSync(join(root, "LICENSE"), "utf8");
assert.equal(packageJson.license, "AGPL-3.0-only");
assert.match(license, /GNU Affero General Public License/u);
assert.match(license, /version 3/u);
const runtime = JSON.parse(
  readFileSync(join(root, "runtime-release", "manifest.json"), "utf8"),
);
assert.equal(runtime.schema, "tracecc-package-runtime-v1");
assert.deepEqual(runtime.package, {
  name: packageJson.name,
  version: packageJson.version,
});
assert.equal(runtime.targetPath, `cpp/tracecc/${runtime.consumerHash}`);
assert.ok(runtime.files.length > 0);

for (const file of runtime.files) {
  const bytes = readFileSync(
    join(root, "runtime-release", runtime.consumerHash, ...file.path.split("/")),
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
assert.ok(report.unpackedSize < 160_000_000);
console.log(
  `PASS: ${report.id} packs ${report.files.length} files (${report.size} bytes compressed) with ${runtime.releaseId}.`,
);
