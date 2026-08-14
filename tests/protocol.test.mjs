import assert from "node:assert/strict";
import test from "node:test";

import {
  TRACECC_COMPILE_PROTOCOL_VERSION,
  TRACECC_TOOLCHAIN_RELEASE_PROTOCOL_VERSION,
  assertTraceCCCompileRequest,
  assertTraceCCToolchainRelease,
  traceCCFrontendArguments,
  traceCCLinkerArguments,
} from "../dist/index.js";

const request = {
  protocolVersion: TRACECC_COMPILE_PROTOCOL_VERSION,
  language: "c++23",
  sourcePath: "/workspace/main.cpp",
  source: "int main() { return 0; }",
  objectPath: "/scratch/main.o",
  outputPath: "/scratch/program.wasm",
  sysrootPath: "/toolchain/sysroot",
  pchPath: "/toolchain/profile.pch",
  runtimeObjects: ["/toolchain/runtime.o"],
  librarySearchPaths: ["/toolchain/lib"],
  libraries: ["c++", "-lc"],
};

test("accepts the fixed generic compile contract", () => {
  assert.doesNotThrow(() => assertTraceCCCompileRequest(request));
  assert.deepEqual(traceCCFrontendArguments(request), [
    "tracecc-cxx",
    "/workspace/main.cpp",
    "/scratch/main.o",
    "/toolchain/sysroot",
    "/toolchain/profile.pch",
  ]);
  assert.deepEqual(traceCCLinkerArguments(request), [
    "wasm-ld",
    "-m",
    "wasm32",
    "-L/toolchain/lib",
    "/scratch/main.o",
    "/toolchain/runtime.o",
    "-z",
    "stack-size=8388608",
    "-lc++",
    "-lc",
    "-o",
    "/scratch/program.wasm",
  ]);
});

test("rejects traversal and unsupported language modes", () => {
  assert.throws(
    () => assertTraceCCCompileRequest({
      ...request,
      sourcePath: "/workspace/../secret.cpp",
    }),
    /normalized/,
  );
  assert.throws(
    () => assertTraceCCCompileRequest({ ...request, language: "gnu++23" }),
    /c17 or c\+\+23/,
  );
});

test("rejects linker options and response files in linker inputs", () => {
  for (const runtimeObject of ["--allow-undefined", "--export-all", "@args.rsp"]) {
    assert.throws(
      () => assertTraceCCCompileRequest({
        ...request,
        runtimeObjects: [runtimeObject],
      }),
      /path, not a linker option/,
    );
  }
  assert.throws(
    () => assertTraceCCCompileRequest({
      ...request,
      libraries: ["c", "--allow-undefined"],
    }),
    /plain library name/,
  );
  assert.throws(
    () => assertTraceCCCompileRequest({
      ...request,
      runtimeObjects: new Array(257).fill("/toolchain/runtime.o"),
    }),
    /at most 256 entries/,
  );
});

test("preserves normalized rooted and relative linker inputs", () => {
  const compatible = {
    ...request,
    runtimeObjects: ["runtime/crt1.o", "/toolchain/runtime.o"],
    librarySearchPaths: ["runtime/lib", "/toolchain/lib"],
    libraries: ["c++", "-lc"],
  };
  assert.doesNotThrow(() => assertTraceCCCompileRequest(compatible));
  assert.deepEqual(
    traceCCLinkerArguments(compatible).filter((argument) =>
      argument.startsWith("-l")
    ),
    ["-lc++", "-lc"],
  );
});

test("validates immutable toolchain release identity", () => {
  const sha256 = "0".repeat(64);
  const artifact = {
    path: "tracecc-reactor.wasm",
    bytes: 1,
    sha256,
    integrity: `sha256-${Buffer.alloc(32).toString("base64")}`,
    mediaType: "application/wasm",
  };
  assert.doesNotThrow(() => assertTraceCCToolchainRelease({
    protocolVersion: TRACECC_TOOLCHAIN_RELEASE_PROTOCOL_VERSION,
    toolchainVersion: "0.1.0",
    contentHash: sha256,
    compilerAbi: "tracecc-fixed-wasm-o0-v1",
    target: "wasm32-wasip1",
    artifacts: {
      reactor: artifact,
      resources: {
        ...artifact,
        path: "llvm-resources.tar",
        mediaType: "application/x-tar",
      },
    },
    source: {
      upstreamUrl: "https://github.com/YoWASP/llvm-project",
      upstreamRevision: "97196c8eeb1d495fa43bb8af2fb26af5ef5b89fb",
      patchSha256: sha256,
    },
  }));
});
