# TraceCC

**Compile C and C++ to WebAssembly in the browser, with no build server.**

TraceCC is the Clang and LLD toolchain, itself compiled to WebAssembly. Your web
app hands it C or C++ source and gets back a WebAssembly module. Nothing is
uploaded, and there is no compile farm to run. It is a compiler you embed, not a
service you call: it never runs the code it produces. You supply the Web Worker,
the WASI host it runs in, and the sandbox where the compiled output runs.

> **Pre-release `0.1.1`.** The API, the request protocol, and the toolchain
> assets can change between minor versions.

## What it does

It compiles one C17 or C++23 translation unit to a WebAssembly object, and links
objects and static libraries into a WASI command module. Multi-file builds,
nested working directories, explicit output paths, diagnostics, and an optional
precompiled header to cut compile time all work.

Not supported: any target but `wasm32-wasip1`, any optimization level but `-O0`,
LLVM bitcode as a linker input, debug output, sanitizers, coverage, LTO,
plugins, and offload toolchains. Compile options live in the compiler, not the
request, so a request cannot change the target, language standard, or
optimization level.

## Install

Requires Node.js 22 or newer.

```sh
pnpm add @tracecode/tracecc
```

## Using it

The package does **not** export a `compile()` function. It ships the compiler
assets — `tracecc-reactor.wasm`, the sysroot, three precompiled-header profiles
with matching runtime objects, and the canonical `tracecode_runtime.hpp` — plus
a small TypeScript library that validates a compile request and builds the exact
compiler and linker argument lists:

```ts
import {
  assertTraceCCCompileRequest,
  traceCCFrontendArguments,
  traceCCLinkerArguments,
} from "@tracecode/tracecc";
```

You write the rest: the Worker that loads the reactor, the WASI host and virtual
filesystem it runs against, request admission and limits, and the sandbox for
the compiled module. Validate anything derived from user input, and choose
`objectPath` and `outputPath` yourself inside a root you admit — never a raw
user filename.

**Start here: [docs/getting-started.md](docs/getting-started.md)** walks through
a complete request, what validation does and does not cover, and self-hosting.

## Self-hosting the assets

There is no TraceCC CDN and no hosted compile service, so you serve the runtime
assets from an origin you control. Copy a hash-named directory from
`runtime-release/` to a public path that keeps its content hash, then resolve
each relative name in its manifest against that base URL and verify its recorded
integrity. Compiler, sysroot, and the smallest precompiled-header profile come
to roughly 85 MB.

## Security and status

TraceCC compiles code that may be entirely attacker-controlled. It transforms
bytes safely; it does not defend the code it produces. You own request
admission, source and time limits, browser isolation headers, Worker retirement,
and a disposable sandbox for compiled output. `0.1.1` is a pre-release
integration surface, not a stable API. [SECURITY.md](SECURITY.md) has the threat
model and private reporting.

## Licensing

TraceCC is licensed under **AGPL-3.0-only** ([LICENSE](LICENSE)). The compiler
artifacts derive from LLVM, Clang, and LLD through the YoWASP LLVM fork, under
the Apache License 2.0 with LLVM Exceptions — see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution and
[legal/CORRESPONDING_SOURCE.md](legal/CORRESPONDING_SOURCE.md) for the packaged
compiler's corresponding source. TraceCC is independently maintained and is not
affiliated with or endorsed by the LLVM Project or YoWASP.

## Documentation

| Document | What it covers |
| --- | --- |
| [docs/getting-started.md](docs/getting-started.md) | Requests, integration, and hosting the assets |
| [docs/architecture.md](docs/architecture.md) | Ownership boundaries, request lifecycle, reactor exports |
| [docs/consumer-release.md](docs/consumer-release.md) | Rebuilding PCH profiles and assembling a release |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development setup and building the toolchain from source |
| [SECURITY.md](SECURITY.md) | Threat model and private reporting |
| [SUPPORT.md](SUPPORT.md) | Where to ask questions |
| [CHANGELOG.md](CHANGELOG.md) | Release notes |
