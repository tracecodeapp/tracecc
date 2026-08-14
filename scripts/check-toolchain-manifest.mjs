import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { traceCCPchCompilerIdentity } from "./pch-compiler-identity.mjs";

const manifestUrl = new URL("../toolchain/manifest.json", import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

if (manifest.schemaVersion !== "tracecc-source-manifest-v1") {
  throw new Error("Unsupported TraceCC source manifest.");
}
if (!/^[0-9a-f]{40}$/.test(manifest.upstream?.revision ?? "")) {
  throw new Error("TraceCC upstream revision must be a full Git commit.");
}
if (
  !/^[0-9a-f]{64}$/.test(manifest.candidate?.rawSha256 ?? "") ||
  !Number.isSafeInteger(manifest.candidate?.rawBytes) ||
  !/^[0-9a-f]{64}$/.test(manifest.candidate?.foldedSha256 ?? "") ||
  !Number.isSafeInteger(manifest.candidate?.foldedBytes)
) {
  throw new Error("TraceCC candidate identity is invalid.");
}
for (const option of [
  "LLD_WASM_TRACECC_NO_BITCODE",
  "CLANG_TRACECC_LEAN_BACKEND",
  "LLVM_TRACECC_LEAN_WASM_O0",
]) {
  if (manifest.cmake?.traceccOptions?.[option] !== true) {
    throw new Error(`TraceCC required CMake option ${option} is not enabled.`);
  }
}
if (
  manifest.buildInputs?.wasiSdk !== "29.0" ||
  manifest.buildInputs?.binaryen !== "131" ||
  !/^[0-9a-f]{64}$/.test(
    manifest.buildInputs?.runtimeResources?.sha256 ?? "",
  ) ||
  !Number.isSafeInteger(manifest.buildInputs?.runtimeResources?.bytes) ||
  manifest.buildInputs?.pchCompiler?.version !==
    "22.0.0-release-noassert-wasm32-frontend.0" ||
  !/^[0-9a-f]{64}$/.test(
    manifest.buildInputs?.pchCompiler?.wasmSha256 ?? "",
  ) ||
  manifest.buildInputs?.pchCompiler?.bundleHashAlgorithm !==
    "sha256-ordered-path-and-file-sha256-v1" ||
  !/^[0-9a-f]{64}$/.test(
    manifest.buildInputs?.pchCompiler?.bundleSha256 ?? "",
  ) ||
  manifest.buildInputs?.pchCompiler?.resourcesSha256 !==
    manifest.buildInputs?.runtimeResources?.sha256 ||
  !/^[0-9a-f]{64}$/.test(manifest.buildInputs?.pgo?.profileSha256 ?? "") ||
  !/^[0-9a-f]{64}$/.test(
    manifest.buildInputs?.pgo?.profileListSha256 ?? "",
  )
) {
  throw new Error("TraceCC frozen build inputs are incomplete.");
}
const pchCompilerIdentity = await traceCCPchCompilerIdentity(
  fileURLToPath(new URL("../toolchain/pch-compiler", import.meta.url)),
);
if (
  pchCompilerIdentity.algorithm !==
    manifest.buildInputs.pchCompiler.bundleHashAlgorithm ||
  pchCompilerIdentity.bundleSha256 !==
    manifest.buildInputs.pchCompiler.bundleSha256 ||
  JSON.stringify(pchCompilerIdentity.files) !==
    JSON.stringify(manifest.buildInputs.pchCompiler.files)
) {
  throw new Error("TraceCC pinned PCH compiler inventory does not match disk.");
}
for (const distribution of ["wasiSdk", "binaryen"]) {
  const platforms = manifest.buildInputs?.distributions?.[distribution]?.platforms;
  for (const platform of ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"]) {
    const artifact = platforms?.[platform];
    if (
      typeof artifact?.archive !== "string" ||
      !artifact.archive.endsWith(".tar.gz") ||
      typeof artifact?.url !== "string" ||
      !artifact.url.startsWith("https://github.com/") ||
      !/^[0-9a-f]{64}$/.test(artifact?.sha256 ?? "")
    ) {
      throw new Error(
        `TraceCC ${distribution} distribution is not pinned for ${platform}.`,
      );
    }
  }
}

console.log(
  `TraceCC ${manifest.candidate.name}: ${manifest.candidate.foldedBytes} bytes ` +
    `${manifest.candidate.foldedSha256}`,
);
