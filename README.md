# TraceCC

TraceCC is a self-contained browser-native C and C++ compiler toolchain. It
packages a reproducible compiler, sysroot, runtime header, PCH profiles, and
runtime objects as one immutable release while leaving execution policy to the
embedder.

The current prototype is based on a pinned YoWASP LLVM fork and contains a
restricted Clang frontend plus WebAssembly-only LLD in one re-entrant WASI
reactor. The fixed production contract is intentionally much smaller than a
general Clang distribution:

- C17 or C++23 source in, WebAssembly object out
- WebAssembly object files in, WASI command module out
- `wasm32-wasip1`, `-O0`, no LLVM bitcode inputs
- no native targets, debug output, sanitizers, coverage, LTO, plugins, or
  offload toolchains

TraceCC never instantiates compiled output. An embedder may keep the trusted
compiler Worker warm, but each untrusted module should execute in a separately
disposable sandbox, memory, process scope, and mutable filesystem.

## Repository boundary

This repository owns:

- the pinned LLVM/Clang/LLD source revision and downstream patch set
- reproducible compiler build configuration
- the fixed compiler/linker invocation contract
- immutable toolchain release manifests, hashes, legal notices, and
  corresponding-source metadata
- the canonical runtime header, PCH build tools, and consumer-release assembler
- host-neutral asset and request validation
- compiler compatibility and browser performance gates

The embedder owns:

- request admission, source generation, and optional instrumentation
- the execution sandbox, capabilities, filesystem, and syscall policy
- result interpretation and application diagnostics
- compiler Worker leases and disposable untrusted-runner lifecycles

See [docs/architecture.md](docs/architecture.md) for the full ownership and
versioning contract.

## Status

`0.1.1` is the current pre-release integration surface. The deterministic v9r2
compiler candidate is frozen: its cold startup is statistically flat against
v8, warm corpus time is lower, and the memory result is inconclusive. Further
LLVM pruning requires a separately reviewed benchmark result.

The v9r2 identity differs from v9r1 because the build now pins LLVM's embedded
repository metadata to the public upstream URL and revision. Independent source
paths therefore produce byte-identical raw and folded reactors.

The generated compiler, sysroot, and toolchain-matched runtime PCH artifacts
are assembled into an immutable consumer release and tracked under
`runtime-release/`. The package therefore owns the exact compiler substrate it
was released with; a clean checkout, CI, and npm packaging all verify the same
bytes. An embedder chooses where to serve those bytes, not which independently
versioned bytes to pair with the package.

`scripts/prepare-toolchain-release.mjs` creates the base compiler release.
Build the PCH shards from `runtime/tracecode_runtime.hpp` using
`docs/consumer-release.md`, then create the complete consumer release with:

```sh
TRACECC_TOOLCHAIN_RELEASE_DIR=/path/to/base-release \
TRACECC_PCH_DIR=/path/to/pch-output \
  pnpm prepare:consumer-release
```

Import the generated content-addressed directory into the npm package with:

```sh
TRACECC_CONSUMER_RELEASE_DIR=/path/to/content-addressed-consumer-release \
  pnpm prepare:package-runtime
pnpm verify:package
```

Commit the resulting content-addressed directory and `runtime-release/manifest.json`
with the TraceCC release. Ordinary `prepack` verifies this tracked inventory; it
does not depend on an ignored local cache.

The consumer release must contain its generated
`tracecc-consumer-lock.json` and `tracecc-runtime-manifest.json`. Package
preparation verifies every declared byte and fails closed on a stale header,
PCH shard, compiler, or sysroot.

The request protocol supports C and C++ translation units, headers, include
paths, definitions, object output, linking, explicit output paths, and nested
working directories. Execution remains deliberately outside TraceCC's trust
boundary.

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
pnpm bootstrap:toolchain -- --build
```

That command verifies the upstream Git revision, WASI SDK archive, Binaryen
archive, packaged PGO profile, and profile list before building. Use
`--root=/path/on/a/large/disk` to keep its checkout and build directory off the
system disk. The equivalent manual invocation is:

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
