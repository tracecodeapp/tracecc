import { createHash } from "node:crypto";
import { access, lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

const releaseRoot = process.env.TRACECC_RELEASE_DIR;
if (!releaseRoot) {
  throw new Error("TRACECC_RELEASE_DIR is required.");
}
const root = await realpath(resolve(releaseRoot));

async function releaseFile(relativePath, label) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.includes("\0") ||
    relativePath.split("/").some((segment) =>
      segment.length === 0 || segment === "." || segment === ".."
    )
  ) {
    throw new Error(`Invalid ${label} path: ${JSON.stringify(relativePath)}`);
  }

  let candidate = root;
  for (const segment of relativePath.split("/")) {
    candidate = join(candidate, segment);
    const metadata = await lstat(candidate);
    if (metadata.isSymbolicLink()) {
      throw new Error(`TraceCC releases cannot contain symlinks: ${relativePath}`);
    }
  }
  const canonical = await realpath(candidate);
  const fromRoot = relative(root, canonical);
  if (
    fromRoot === ".." ||
    fromRoot.startsWith("../") ||
    fromRoot.startsWith("..\\")
  ) {
    throw new Error(`TraceCC ${label} escapes the release root.`);
  }
  return canonical;
}

const release = JSON.parse(
  await readFile(await releaseFile("release.json", "release descriptor"), "utf8"),
);
if (release.protocolVersion !== "tracecc-toolchain-release-v1") {
  throw new Error("Unsupported TraceCC release protocol.");
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

for (const [name, artifact] of Object.entries(release.artifacts ?? {})) {
  const path = await releaseFile(artifact.path, `${name} artifact`);
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
  requiredReleaseFiles.map(async (path) =>
    access(await releaseFile(path, "required release file"))
  ),
);
const patchDigest = await sha256(
  await releaseFile("source/tracecc.patch", "source patch"),
);
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
