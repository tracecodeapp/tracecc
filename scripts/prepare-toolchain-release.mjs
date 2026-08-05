import { createHash } from "node:crypto";
import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const reactorPath = process.env.TRACECC_REACTOR_PATH;
const resourcesPath = process.env.TRACECC_RESOURCES_PATH;
const patchPath = process.env.TRACECC_PATCH_PATH;
const llvmLicensePath = process.env.TRACECC_LLVM_LICENSE_PATH;
const outputRoot = resolve(process.env.TRACECC_RELEASE_ROOT ?? "release");
const toolchainVersion = process.env.TRACECC_TOOLCHAIN_VERSION ?? "0.1.0-dev.0";

if (!reactorPath || !resourcesPath || !patchPath || !llvmLicensePath) {
  throw new Error(
    "TRACECC_REACTOR_PATH, TRACECC_RESOURCES_PATH, TRACECC_PATCH_PATH, and TRACECC_LLVM_LICENSE_PATH are required.",
  );
}

async function digest(path) {
  const bytes = await readFile(path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    bytes,
    sha256,
    integrity: `sha256-${Buffer.from(sha256, "hex").toString("base64")}`,
  };
}

const [reactor, resources, patch, sourceManifest] = await Promise.all([
  digest(resolve(reactorPath)),
  digest(resolve(resourcesPath)),
  digest(resolve(patchPath)),
  readFile(new URL("../toolchain/manifest.json", import.meta.url), "utf8")
    .then(JSON.parse),
]);
if (
  reactor.sha256 !== sourceManifest.candidate.foldedSha256 ||
  reactor.bytes.byteLength !== sourceManifest.candidate.foldedBytes
) {
  throw new Error("TraceCC reactor does not match the frozen candidate.");
}
if (
  resources.sha256 !== sourceManifest.buildInputs.runtimeResources.sha256 ||
  resources.bytes.byteLength !== sourceManifest.buildInputs.runtimeResources.bytes
) {
  throw new Error(
    "TraceCC runtime resources do not match the PCH-compatible frozen sysroot.",
  );
}
const contentHash = createHash("sha256")
  .update(reactor.sha256)
  .update(resources.sha256)
  .update(patch.sha256)
  .digest("hex");
const releaseRoot = join(outputRoot, toolchainVersion, contentHash);
await Promise.all([
  mkdir(join(releaseRoot, "source"), { recursive: true }),
  mkdir(join(releaseRoot, "legal"), { recursive: true }),
]);

const reactorName = "tracecc-reactor.wasm";
const resourcesName = basename(resourcesPath);
await Promise.all([
  cp(resolve(reactorPath), join(releaseRoot, reactorName)),
  cp(resolve(resourcesPath), join(releaseRoot, resourcesName)),
  cp(resolve(patchPath), join(releaseRoot, "source", "tracecc.patch")),
  cp(
    new URL("./build-toolchain.sh", import.meta.url),
    join(releaseRoot, "source", "build-toolchain.sh"),
  ),
  cp(
    new URL("../toolchain/Toolchain-WASI-LLVM.cmake", import.meta.url),
    join(releaseRoot, "source", "Toolchain-WASI-LLVM.cmake"),
  ),
  cp(
    resolve(llvmLicensePath),
    join(releaseRoot, "legal", "LLVM-LICENSE.TXT"),
  ),
  cp(
    new URL("../THIRD_PARTY_NOTICES.md", import.meta.url),
    join(releaseRoot, "legal", "THIRD_PARTY_NOTICES.md"),
  ),
  cp(
    new URL("../legal/CORRESPONDING_SOURCE.md", import.meta.url),
    join(releaseRoot, "legal", "CORRESPONDING_SOURCE.md"),
  ),
  writeFile(
    join(releaseRoot, "source", "manifest.json"),
    `${JSON.stringify(sourceManifest, null, 2)}\n`,
  ),
]);

const release = {
  protocolVersion: "tracecc-toolchain-release-v1",
  toolchainVersion,
  contentHash,
  compilerAbi: sourceManifest.compilerAbi,
  target: "wasm32-wasip1",
  artifacts: {
    reactor: {
      path: reactorName,
      bytes: reactor.bytes.byteLength,
      sha256: reactor.sha256,
      integrity: reactor.integrity,
      mediaType: "application/wasm",
    },
    resources: {
      path: resourcesName,
      bytes: resources.bytes.byteLength,
      sha256: resources.sha256,
      integrity: resources.integrity,
      mediaType: "application/x-tar",
    },
  },
  source: {
    upstreamUrl: sourceManifest.upstream.url,
    upstreamRevision: sourceManifest.upstream.revision,
    patchSha256: patch.sha256,
  },
};
await writeFile(
  join(releaseRoot, "release.json"),
  `${JSON.stringify(release, null, 2)}\n`,
);

const releaseSize = await stat(join(releaseRoot, reactorName));
console.log(
  JSON.stringify({
    releaseRoot,
    contentHash,
    reactorBytes: releaseSize.size,
    resourcesBytes: resources.bytes.byteLength,
  }, null, 2),
);
