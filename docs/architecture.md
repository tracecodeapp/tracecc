# TraceCC architecture

How responsibility is divided between TraceCC and the app embedding it, and what
each release layer guarantees. Start with the [README](../README.md) if you have
not read it yet.

## Decision

TraceCC exposes a fixed browser compiler contract rather than a general Clang
installation. Clang, LLVM, and LLD are the current implementation and may be
updated or replaced without changing the public request protocol unless the
observable compiler ABI changes.

The trusted compiler may remain warm. Compiled output is always untrusted and
must execute in an independently disposable sandbox owned by the embedder.

## Authority boundaries

| Component | May do | Must not do |
| --- | --- | --- |
| TraceCC toolchain | Compile admitted C/C++ source to WebAssembly objects and link admitted objects to a WASI module | Instantiate output or own application capabilities |
| TraceCC compiler Worker | Retain immutable compiler/sysroot state and private mutable compiler scratch state | Receive capabilities intended only for compiled code |
| Embedder adapter | Generate source, select immutable PCH/runtime objects, admit requests, and enforce byte/time limits | Change the fixed compiler contract without a version bump |
| Execution sandbox | Instantiate a compiled module inside a fresh process, memory, filesystem, and capability scope | Trust compiler output or reuse tainted mutable state |

Compiler trust is narrow. The compiler transforms bytes using an immutable
toolchain mount and per-request scratch filesystem. Its output crosses into the
execution sandbox only as untrusted bytes.

## Lifecycle

1. The embedder resolves and preflights one immutable TraceCC runtime manifest.
2. It creates a compiler Worker and initializes the reactor, sysroot, and one
   compatible PCH/runtime-object profile.
3. Each request gets fresh mutable compiler filesystem state.
4. The reactor compiles source to a WebAssembly object and links only admitted
   WebAssembly objects and archives. LLVM bitcode is rejected.
5. The Worker returns completed module bytes to the embedder.
6. The embedder creates a fresh untrusted execution scope and retires it at its
   documented safety boundary.
7. The compiler Worker remains warm only until its independent compile-count,
   memory, crash, abort, or release-version boundary requires retirement.

No compiler linear memory, writable filesystem state, file descriptor, or
JavaScript object crosses into an untrusted runner.

## Reactor interface

The reactor is one re-entrant WASI module acting as both compiler and linker.
The embedder's host instantiates it once and calls its exports:

| Export | Purpose |
| --- | --- |
| `tracecc_run(argc, argv)` | Run one command; returns an exit code |
| `tracecc_alloc(size)` / `tracecc_free(ptr)` | Allocate the argv storage the host owns |
| `tracecc_can_run_again()` | Whether the reactor is still reusable |

`tracecc_run` dispatches on `argv[0]`, which is why the package's argument
builders put the program name first. `tracecc-c` and `tracecc-cxx` are the fixed
frontends and `wasm-ld` is the linker, so a full build is two calls: compile,
then link.

Check `tracecc_can_run_again()` after every call; when it returns false, retire
the Worker and start a fresh one. Give each request fresh mutable filesystem
state — the toolchain mount is immutable and shared, but the scratch space must
not be reused across requests.

## Release surfaces

TraceCC has two release layers:

- the immutable base toolchain release: reactor Wasm, resources/sysroot,
  release descriptor, legal material, source manifest, and downstream patches;
- the package-owned consumer release: the base toolchain plus the canonical
  runtime header, PCH profiles, runtime objects, a content lock, and a
  route-neutral asset manifest.

`scripts/prepare-consumer-release.mjs` is the only supported assembler for the
second layer. It verifies the base release, hashes every input, and emits
relative asset names. Hosting origins and URL layouts are intentionally absent
from the manifest and remain an embedder decision.

Mutable `latest` URLs are forbidden. Every asset descriptor records byte size,
SHA-256 integrity, media type, and immutable delivery policy.

## Compatibility keys

The embedder must reject a mismatched set before compilation. The compatibility
identity contains:

- TraceCC request protocol version;
- base toolchain content hash and compiler ABI revision;
- target triple and C/C++ language mode;
- sysroot digest;
- runtime-header, PCH, and runtime-object digests.

Changing the runtime header rebuilds only the consumer layer. Changing the
compiler cannot silently reuse PCH artifacts produced by another toolchain.

## Release gates

A release is reviewable only when:

- a clean build from the pinned source revision and patch reproduces the frozen
  compiler artifact;
- the base descriptor, consumer lock, and route-neutral runtime manifest agree
  byte-for-byte;
- every PCH is smoke-consumed with its matching compiler and anchor source;
- C and C++ smoke programs cover multi-file compilation, object output,
  linking, nested working directories, and diagnostics;
- cancellation, compiler retirement, artifact caching, and integrity failures
  have targeted tests;
- Chromium, Firefox, and WebKit compile results agree for the supported corpus.
