import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const releaseRoot = process.env.TRACECC_RELEASE_DIR;
if (!releaseRoot) {
  throw new Error("TRACECC_RELEASE_DIR is required.");
}
const root = resolve(releaseRoot);
const release = JSON.parse(await readFile(join(root, "release.json"), "utf8"));
if (release.protocolVersion !== "tracecc-toolchain-release-v1") {
  throw new Error("Unsupported TraceCC release protocol.");
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

for (const [name, artifact] of Object.entries(release.artifacts ?? {})) {
  const path = join(root, artifact.path);
  const content = await readFile(path);
  const digest = createHash("sha256").update(content).digest("hex");
  if (digest !== artifact.sha256 || content.byteLength !== artifact.bytes) {
    throw new Error(`TraceCC ${name} artifact identity mismatch.`);
  }
  const integrity =
    `sha256-${Buffer.from(digest, "hex").toString("base64")}`;
  if (integrity !== artifact.integrity) {
    throw new Error(`TraceCC ${name} SRI mismatch.`);
  }
}

const requiredReleaseFiles = [
  "source/tracecc.patch",
  "source/manifest.json",
  "source/build-toolchain.sh",
  "source/Toolchain-WASI-LLVM.cmake",
  "legal/LLVM-LICENSE.TXT",
  "legal/THIRD_PARTY_NOTICES.md",
  "legal/CORRESPONDING_SOURCE.md",
];
await Promise.all(
  requiredReleaseFiles.map((path) => access(join(root, path))),
);
const patchDigest = await sha256(join(root, "source/tracecc.patch"));
if (patchDigest !== release.source?.patchSha256) {
  throw new Error("TraceCC release patch digest mismatch.");
}
const expectedContentHash = createHash("sha256")
  .update(release.artifacts.reactor.sha256)
  .update(release.artifacts.resources.sha256)
  .update(patchDigest)
  .digest("hex");
if (expectedContentHash !== release.contentHash) {
  throw new Error("TraceCC release content hash mismatch.");
}

console.log(
  `Verified TraceCC ${release.toolchainVersion}/${release.contentHash}`,
);
