# Getting started with TraceCC

How to build a compile request, drive the compiler, and host the assets. Read
the [README](../README.md) first for what TraceCC is and is not.

TraceCC is a compiler you embed. Before it can compile anything for you, you
need three pieces that the package does not ship:

1. **A Web Worker** that loads `tracecc-reactor.wasm` and keeps it warm.
2. **A WASI host and virtual filesystem** for the reactor to run against, with
   an immutable toolchain mount and fresh scratch space per request.
3. **A sandbox** that runs the compiled module. TraceCC never executes its own
   output, and the right way to run untrusted code depends on your app.

[architecture.md](architecture.md) documents the reactor's exports, the request
lifecycle, and the compatibility keys to check before you compile.

## Install

Requires Node.js 22 or newer.

```sh
pnpm add @tracecode/tracecc
```

The package is ESM-only. Everything is exported from the package root, and the
same exports are also available from `@tracecode/tracecc/protocol`.

## Build a request

A request describes one translation unit and where its outputs go. All paths
are POSIX paths inside *your* virtual filesystem.

```ts
import {
  TRACECC_COMPILE_PROTOCOL_VERSION,
  assertTraceCCCompileRequest,
  traceCCFrontendArguments,
  traceCCLinkerArguments,
  type TraceCCCompileRequest,
} from "@tracecode/tracecc";

const request: TraceCCCompileRequest = {
  protocolVersion: TRACECC_COMPILE_PROTOCOL_VERSION, // "tracecc-compile-v1"
  language: "c++23",                                 // or "c17"
  sourcePath: "/workspace/main.cpp",
  source: "int main() { return 0; }\n",
  objectPath: "/scratch/main.o",
  outputPath: "/scratch/program.wasm",
  sysrootPath: "/toolchain/sysroot",

  // Optional:
  pchPath: "/toolchain/profile.pch",
  runtimeObjects: [
    "/toolchain/sysroot/lib/wasm32-wasip1/crt1-command.o",
    "/toolchain/runtime.o",
  ],
  librarySearchPaths: ["/toolchain/sysroot/lib/wasm32-wasip1"],
  libraries: ["c++", "-lc"],   // a leading "-l" is stripped
  stackBytes: 8 * 1024 * 1024, // default; 64 KiB to 64 MiB
};

assertTraceCCCompileRequest(request); // throws TypeError on a malformed request
```

After validation, create the parent directories and write `request.source` as
UTF-8 bytes to `request.sourcePath` in the virtual filesystem. The argument
builder passes the path, not the source string, to Clang. Use fresh scratch
space so an unwritten path cannot reuse an older request's contents.

Then turn it into the two argument lists the reactor expects — one to compile,
one to link:

```ts
traceCCFrontendArguments(request);
// ["tracecc-cxx", "/workspace/main.cpp", "/scratch/main.o",
//  "/toolchain/sysroot", "/toolchain/profile.pch"]

traceCCLinkerArguments(request);
// ["wasm-ld", "-m", "wasm32",
//  "-L/toolchain/sysroot/lib/wasm32-wasip1", "/scratch/main.o",
//  "/toolchain/sysroot/lib/wasm32-wasip1/crt1-command.o",
//  "/toolchain/runtime.o", "-z", "stack-size=8388608", "-lc++", "-lc",
//  "-o", "/scratch/program.wasm"]
```

Both builders re-validate the request before returning, so a malformed request
cannot reach an argument list. The first element is the program name, because
the reactor dispatches on `argv[0]`: `tracecc-c` and `tracecc-cxx` are the
frontends, `wasm-ld` is the linker. A full build is those two calls in order.

There are no `-I` or `-D` flags. Include paths are fixed to the sysroot, so
your own headers belong in the request's virtual filesystem next to the source.
Optimization is fixed at `-O0` and the target is always `wasm32-wasip1`; a
request cannot change either.

For a multi-file build, compile each translation unit and copy its object bytes
back into host-owned memory or storage. Before the final link, write those
objects into that request's fresh filesystem — or an admitted persistent,
immutable mount — and list their paths in `runtimeObjects`.

## What validation does and does not cover

`assertTraceCCCompileRequest` is the security-relevant call. Run it on anything
derived from user input. It rejects:

- a wrong `protocolVersion`, or a `language` other than `c17` or `c++23`;
- paths that are empty, non-string, or contain a backslash or a null byte;
- unnormalized paths — any `.`, `..`, or empty segment, so `..` traversal is
  rejected outright;
- linker inputs (`runtimeObjects`, `librarySearchPaths`) that start with `-` or
  `@`, which is how a raw option or a response file would be smuggled in;
- library names that are not plain names, after stripping a leading `-l`;
- more than 256 `runtimeObjects`, 64 `librarySearchPaths`, or 128 `libraries`;
- a `stackBytes` outside 64 KiB to 64 MiB.

It does **not** cover these, and you have to:

- **Choose `objectPath` and `outputPath` yourself.** They are host-chosen paths
  inside a virtual-filesystem root you admit. The option-shaped check applies
  only to the optional linker inputs, so a raw user filename in either field is
  not caught for you. The same goes for `sourcePath`, `sysrootPath`, and
  `pchPath`.
- **Enforce your own quotas.** TraceCC does not limit source size, output
  bytes, or compile time. Your host admits requests, caps them, and retires
  Workers.
- **Sandbox the result.** The module TraceCC returns is untrusted output.

## Self-host the assets

There is no TraceCC CDN and no hosted compile service. You serve the runtime
assets from an origin you control.

The package tracks them under `runtime-release/`, in a directory named after
the hash of its own contents. That directory's `tracecc-runtime-manifest.json`
lists every asset by *relative* URL, SHA-256 integrity, byte size, and media
type — with no origin or route baked in. It groups them as `compilerWasm` and
`linkerWasm` (both the reactor), `sysroot`, `runtimeHeader`, and a
`compilerResources` entry per precompiled-header profile.

Use the installed package's `runtime-release/manifest.json` as the root of
trust. It pins the release files, including `tracecc-runtime-manifest.json`, by
path, size, and SHA-256. Verify the fetched runtime manifest against that
package-owned record before trusting any digest inside it. A manifest fetched
from the same mutable origin as the assets is not a trust anchor by itself.

To host a release:

1. Copy the whole hash-named directory to a public path that **keeps its
   content hash**, such as `/tracecc/<consumer-hash>/`.
2. Use that path as the base URL and resolve each relative asset name against
   it.
3. Serve the files as immutable and verify each one against its recorded
   integrity before use.

Do not flatten releases into a stable path and do not publish a mutable
`latest` alias. The URL has to change whenever the bytes do, so a cached asset
can never belong to an older release.

Before compiling, install the fetched assets into the reactor's virtual
filesystem:

- Extract `llvm-resources.tar` into the directory named by `sysrootPath`; the
  archive itself is not a usable sysroot. The extracted tree supplies both the
  library search directory and `crt1-command.o` used in the request above.
- When using a PCH, write the manifest's `runtimeHeader` to
  `/tracecode_runtime.hpp` and the selected profile's `*-pch-source` to
  `/tracecode_pch.hpp`. Those filenames are recorded inside the PCH. Also write
  the profile's PCH bytes to `pchPath` and its matching runtime object to the
  path listed in `runtimeObjects`.

### Budget for the download

The three profiles (`narrow`, `broad`, `map`) preinstantiate different amounts
of `tracecode_runtime.hpp`. Load the smallest one that covers your code.

| Asset | Size |
| --- | --- |
| `tracecc-reactor.wasm` (compiler and linker) | 33.5 MB |
| `llvm-resources.tar` (sysroot) | 29.1 MB |
| `narrow.pch` + `narrow.o` | 22.4 MB |
| `broad.pch` + `broad.o` | 26.4 MB |
| `map.pch` + `map.o` | 33.3 MB |

Reactor, sysroot, and the `narrow` profile come to roughly 85 MB.

Each profile also publishes the anchor source its precompiled header was built
from. Pass a profile's `.pch` as `pchPath` and link its matching `.o` through
`runtimeObjects` — a precompiled header is only valid with the compiler and
header digests it was built against, which is what the compatibility keys in
[architecture.md](architecture.md#compatibility-keys) exist to check.

## Next steps

- [architecture.md](architecture.md) — reactor exports, request lifecycle,
  ownership boundaries, and release gates.
- [../SECURITY.md](../SECURITY.md) — the threat model, and where the line falls
  between TraceCC's invariants and yours.
- [consumer-release.md](consumer-release.md) — regenerating the precompiled
  headers and assembling a release, if you are maintaining one.
