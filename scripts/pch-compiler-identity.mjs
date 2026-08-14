import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const TRACECC_PCH_COMPILER_FILES = Object.freeze([
  "bundle.js",
  "llvm-resources.js",
  "llvm-resources.tar",
  "llvm.core.wasm",
  "llvm.core2.wasm",
  "llvm.core3.wasm",
  "llvm.core4.wasm",
  "llvm.js",
]);

export async function traceCCPchCompilerIdentity(compilerDirectory) {
  const files = [];
  const bundle = createHash("sha256");
  for (const path of TRACECC_PCH_COMPILER_FILES) {
    const bytes = await readFile(join(compilerDirectory, path));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    files.push({ path, bytes: bytes.byteLength, sha256 });
    bundle.update(path).update("\0").update(sha256).update("\0");
  }
  return {
    algorithm: "sha256-ordered-path-and-file-sha256-v1",
    bundleSha256: bundle.digest("hex"),
    files,
  };
}
