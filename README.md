# TraceCC

**Compile C and C++ to WebAssembly in the browser, with no build server.**

TraceCC is the Clang and LLD toolchain, itself compiled to WebAssembly. Your web
app hands it C or C++ source and gets back a WebAssembly module. Nothing is
uploaded, and there is no compile farm to run.

TraceCC never runs the module it produces. It is a compiler you embed, not a
service you call: you supply the Web Worker, the WASI host it runs in, and the
sandbox where the compiled output executes. How to safely run untrusted code
depends on your app, so TraceCC leaves that choice to you.

> **Pre-release `0.1.1`.** The API, the request protocol, and the toolchain
> assets can change between minor versions.

## What it does, and what it does not

Supported:

- Compile one C17 or C++23 translation unit to a WebAssembly object.
- Link WebAssembly objects and static libraries into a WASI command module.
- Multi-file builds, nested working directories, explicit output paths, and
  compiler diagnostics.
- An optional precompiled header, to cut compile time.

Not supported:

- Any target other than `wasm32-wasip1`.
- Optimization — the level is fixed at `-O0`.
- LLVM bitcode as a linker input.
- Debug output, sanitizers, coverage, LTO, plugins, or offload toolchains.

Compile options are fixed in the compiler, not passed per request — a request
cannot change the target, language standard, or optimization level.

## What ships, and what you build

The `@tracecode/tracecc` package does **not** export a `compile()` function. It
gives you the compiler and the rules for driving it.

**You get** `tracecc-reactor.wasm` (Clang and LLD as a single WebAssembly
reactor), `llvm-resources.tar` (the sysroot), three precompiled-header profiles
with matching runtime objects, the canonical `tracecode_runtime.hpp`, and a
TypeScript library that validates requests and builds the exact compiler and
linker argument lists.

**You build** the Web Worker that loads the reactor, the WASI host and virtual
filesystem it runs against, request admission and limits, an origin to serve the
assets from, and the sandbox that executes the compiled module — a WASI shim and
a Worker come before TraceCC compiles anything for you.

[docs/architecture.md](docs/architecture.md) covers the reactor's exports, the
request lifecycle, and the compatibility keys to check before compiling.

## Install and build a request

Requires Node.js 22 or newer.

```sh
pnpm add @tracecode/tracecc
```

The library validates a request and builds the two argument lists the compiler
expects, one to compile and one to link:

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
  language: "c++23",
  sourcePath: "/work/main.cpp",
  source: "int main() { return 0; }\n",
  objectPath: "/work/main.o",
  outputPath: "/work/main.wasm",
  sysrootPath: "/toolchain/sysroot",
};

assertTraceCCCompileRequest(request); // throws TypeError on a malformed request

traceCCFrontendArguments(request);
// ["tracecc-cxx", "/work/main.cpp", "/work/main.o", "/toolchain/sysroot"]

traceCCLinkerArguments(request);
// ["wasm-ld", "-m", "wasm32", "/work/main.o",
//  "-z", "stack-size=8388608", "-o", "/work/main.wasm"]
```

`assertTraceCCCompileRequest` is the security-relevant part: it rejects
unnormalized paths, `..` traversal, backslashes, null bytes, anything shaped
like a linker option or a response file in the optional linker inputs, library
names that are not plain names, invalid stack sizes, and overlong optional
lists. Call it on anything derived from user input. Choose `objectPath` and
`outputPath` yourself inside an admitted virtual-filesystem root; do not copy an
untrusted filename into either field. Your host must still enforce source,
byte, and time limits.

The TypeScript types document the optional fields: precompiled headers, runtime
objects, libraries, and stack size. There are no `-I` or `-D` flags — include
paths are fixed to the sysroot, so your own headers go into the request's
virtual filesystem.

## Self-hosting the assets

TraceCC does not operate a public CDN or a hosted compile service. You serve the
runtime assets from an origin you control.

The package tracks them under `runtime-release/`, in directories named after the
hash of their own contents. Each one's `tracecc-runtime-manifest.json` lists
every asset by relative URL, SHA-256, byte size, and media type — deliberately
with no origin or route baked in.

Copy the whole hash-named directory to a public path that preserves its content
hash, such as `/tracecc/<consumer-hash>/`, and use that path as the base URL.
Resolve each relative name against it, serve the files as immutable, and verify
each against its recorded integrity. Do not flatten releases into a stable path
or publish a mutable `latest` alias: the URL must change whenever the bytes do,
so a cached asset can never belong to an older release.

Budget for the download: compiler, sysroot, and one precompiled-header profile
come to roughly 85 MB. The three profiles (`narrow`, `broad`, `map`)
preinstantiate different amounts of `tracecode_runtime.hpp` — load the smallest
that covers your code.

## Security and status

TraceCC compiles code that may be entirely attacker-controlled. It transforms
bytes safely; it does not defend the code it produces.

**TraceCC guarantees** that request paths are normalized and cannot use
traversal, optional runtime-object and library inputs cannot inject raw options
or response files, release paths stay inside their release root, and executable
assets match their pinned size and SHA-256.

**You are responsible for** admitting requests, setting byte and time limits,
binding paths to your virtual filesystem roots, retiring Workers, sending the
right browser isolation headers, and running compiled output in a disposable
sandbox with no capabilities meant for trusted code.

`0.1.1` is a pre-release integration surface, not a stable API. The compiler,
sysroot, and matching runtime artifacts ship as one immutable release tracked in
this repository, so the package owns the exact compiler it was released with.
Releases are gated on reproducing that frozen compiler from pinned source, on
the release descriptor, consumer lock, and runtime manifest agreeing
byte-for-byte, and on C and C++ compile results agreeing across Chromium,
Firefox, and WebKit.

Report suspected vulnerabilities privately ([SECURITY.md](SECURITY.md)).

## Licensing

TraceCC is licensed under **AGPL-3.0-only** ([LICENSE](LICENSE)). Review its
terms before redistributing TraceCC or making a modified version available over
a network.

The compiler artifacts derive from LLVM, Clang, and LLD via the YoWASP LLVM
fork, under the Apache License 2.0 with LLVM Exceptions — see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
[legal/CORRESPONDING_SOURCE.md](legal/CORRESPONDING_SOURCE.md), which describes
the complete corresponding source for the packaged compiler. TraceCC is
independently maintained and is not affiliated with or endorsed by the LLVM
Project or YoWASP.

## Where to go next

| Document | What it covers |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Ownership boundaries, request lifecycle, reactor exports, release gates |
| [docs/consumer-release.md](docs/consumer-release.md) | Rebuilding the PCH profiles and assembling a release |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development setup, and building the toolchain from source |
| [SECURITY.md](SECURITY.md) | Threat model and private reporting |
| [SUPPORT.md](SUPPORT.md) | Where to ask questions |
| [CHANGELOG.md](CHANGELOG.md) | Release notes |
