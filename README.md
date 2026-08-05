# TraceCC

TraceCC is TraceCode's browser-native C and C++ compiler toolchain. It is a
separate project because the compiler is a large, independently built and
released substrate; it is not part of TraceKernel and it must not be rebuilt
when TraceKernel's process, filesystem, tracing, or Judge policy changes.

The current prototype is based on a pinned YoWASP LLVM fork and contains a
restricted Clang frontend plus WebAssembly-only LLD in one re-entrant WASI
reactor. The fixed production contract is intentionally much smaller than a
general Clang distribution:

- C17 or C++23 source in, WebAssembly object out
- WebAssembly object files in, WASI command module out
- `wasm32-wasip1`, `-O0`, no LLVM bitcode inputs
- no native targets, debug output, sanitizers, coverage, LTO, plugins, or
  offload toolchains

TraceCC never instantiates learner output. A TraceKernel embedder keeps the
trusted compiler Worker warm and gives every learner execution a separately
disposable runner, memory, process scope, and mutable filesystem.

## Repository boundary

This repository owns:

- the pinned LLVM/Clang/LLD source revision and downstream patch set
- reproducible compiler build configuration
- the fixed compiler/linker invocation contract
- immutable toolchain release manifests, hashes, legal notices, and
  corresponding-source metadata
- host-neutral asset and request validation
- compiler compatibility and browser performance gates

The harness owns:

- TraceKernel capabilities and syscall policy
- learner source instrumentation and generated drivers
- TraceCode runtime headers and exact toolchain-matched PCH/runtime objects
- Judge batching, result interpretation, and product diagnostics
- the warm compiler Worker lease and disposable learner-runner lifecycle

See [docs/architecture.md](docs/architecture.md) for the full ownership and
versioning contract.

## Status

`0.1.0` is the first pre-release integration surface. The deterministic v9r1
compiler candidate is frozen: its cold startup is statistically flat against
v8, warm corpus time is lower, and the memory result is inconclusive. Further
LLVM pruning stays in the external research tree until it clears the documented
stop rule.

The generated compiler, sysroot, and resource artifacts are not committed and
are not included in the npm package. `scripts/prepare-toolchain-release.mjs`
creates an immutable, content-addressed release directory from an explicit
artifact set.

The TraceCode harness cutover uses TraceCC for Practice, Judge, and generic
Project compilation. Project mode supports C and C++ translation units,
headers, include paths, definitions, object output, linking, explicit output
paths, and nested working directories. Learner modules still run exclusively
through TraceKernel.

## Build and verify

The TypeScript package and source/build manifest can be verified without the
large generated compiler artifacts:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm verify:package
```

Rebuilding the compiler requires the pinned LLVM checkout and build inputs
named in `toolchain/manifest.json`:

```sh
TRACECC_SOURCE_DIR=/path/to/llvm-project \
TRACECC_BUILD_DIR=/path/to/build \
TRACECC_WASI_SDK=/path/to/wasi-sdk \
TRACECC_PGO_PROFILE=/path/to/merged.profdata \
TRACECC_PGO_LIST=/path/to/profile-list.txt \
TRACECC_WASM_OPT=/path/to/wasm-opt \
pnpm build:toolchain
```

TraceCC is independently maintained and is not affiliated with, sponsored by,
or endorsed by the LLVM Project or YoWASP.
