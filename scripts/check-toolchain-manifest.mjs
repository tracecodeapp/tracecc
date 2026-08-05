import { readFile } from "node:fs/promises";

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
  !/^[0-9a-f]{64}$/.test(manifest.buildInputs?.pgo?.profileSha256 ?? "") ||
  !/^[0-9a-f]{64}$/.test(
    manifest.buildInputs?.pgo?.profileListSha256 ?? "",
  )
) {
  throw new Error("TraceCC frozen build inputs are incomplete.");
}

console.log(
  `TraceCC ${manifest.candidate.name}: ${manifest.candidate.foldedBytes} bytes ` +
    `${manifest.candidate.foldedSha256}`,
);
