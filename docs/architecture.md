# TraceCC architecture

## Decision

The project and public abstraction are named **TraceCC**, not TraceClang.
Clang/LLVM/LLD are the first implementation and may be replaced or forked
further without changing the product-facing compiler contract.

TraceCC is a separate repository and release surface, following the useful
part of the TraceJVM 0.4 boundary: the expensive trusted compiler remains warm,
while untrusted learner execution is independently disposable. Unlike
TraceJVM, TraceCC does not need to provide a language VM. The compiled WASI
module runs through the ordinary TraceKernel C/C++ runner.

## Authority boundaries

| Component | May do | Must not do |
| --- | --- | --- |
| TraceCC toolchain | Compile normalized C/C++ source to a Wasm object and link Wasm objects to a WASI module | Instantiate learner output, own processes, network, terminals, or Judge policy |
| TraceCC compiler Worker | Retain immutable compiler/sysroot state and private mutable compiler scratch state | Receive TraceKernel capabilities needed only by learner code |
| Harness adapter | Generate/instrument source, select PCH/runtime objects, admit compile requests, enforce byte/time limits | Change the fixed compiler contract without a version bump |
| TraceKernel runner | Instantiate a compiled module inside a fresh admitted process, memory, filesystem, and trace scope | Trust compiler state as learner state or reuse a tainted learner scope |
| Judge | Batch cases and interpret outcomes on top of TraceKernel | Bypass TraceKernel or move correctness policy into TraceCC |

Compiler trust is narrow. The compiler may use a fast private immutable
toolchain mount and per-request scratch filesystem because it transforms bytes
and never receives learner execution authority. Compiler output is still
untrusted input to TraceKernel.

## Lifecycle

1. The app resolves and preflights one immutable TraceCC release descriptor.
2. The harness creates one trusted compiler Worker and initializes the reactor,
   sysroot, compiler resources, and selected immutable PCH/runtime objects.
3. A compile request gets a fresh mutable compiler filesystem fork. Immutable
   backing buffers and safe immutable path caches may be shared.
4. The reactor compiles source to a Wasm object and links only accepted Wasm
   object/archive inputs. LLVM bitcode is rejected.
5. The compiler Worker transfers the completed module bytes to the harness.
6. TraceKernel creates a fresh learner runner scope for the batch. Each case
   receives the product's required process/filesystem/trace isolation.
7. The runner is retired at the existing safety boundary. The compiler remains
   warm until its independent compile-count, memory, crash, abort, or version
   boundary requires retirement.

No compiler linear memory, writable filesystem state, file descriptor, or
JavaScript object crosses into a learner runner.

## Release surfaces

TraceCC has two independently versioned release layers:

- `@tracecode/tracecc`: the TypeScript contracts and validation plus the
  package-owned, content-addressed `runtime-release/<consumer-hash>/` consumer
  bundle. The bundle records the exact compiler, sysroot, runtime header, PCH,
  and runtime-object bytes shipped with that package release.
- the immutable base toolchain release: the reactor Wasm, resources/sysroot
  archive, release descriptor, legal material, source manifest, and downstream
  patches used to assemble a consumer bundle.

TraceCode-specific PCH and runtime-object shards remain harness-owned inputs,
not part of the base generic toolchain. Their descriptors pin the exact
TraceCC toolchain content hash and compile ABI before they are copied into a
tracked consumer bundle. A TraceKernel header change may therefore rebuild the
consumer artifacts without rebuilding LLVM.

Mutable `latest` URLs are forbidden. A release path is
`tracecc/<toolchain-version>/<content-hash>/`, and every leaf records byte size,
SHA-256, SRI, media type, and cache policy.

## Compatibility keys

The harness must reject a mismatched set before compilation. The compatibility
key contains:

- TraceCC request protocol version
- toolchain release content hash
- target triple and C/C++ language modes
- compiler ABI revision
- sysroot digest
- PCH/runtime-object digest and their recorded toolchain content hash

TraceKernel and Judge versions are deliberately absent unless their generated
header/object ABI changes.

## Integration rule

The v9r1 reactor is the sole trusted browser compiler path for C and C++.
Practice, Judge, and generic Project requests use the same compiler authority;
there is no YoWASP fallback or client-side rollout flag. Unsupported request
shapes are rejected before compilation and toolchain failures remain visible.
Learner execution continues through the ordinary C++ TraceKernel runner.

The harness composes the generic TraceCC release with its own runtime header,
PCH profiles, and runtime objects. That consumer release has a separate content
hash, so changing TraceKernel instrumentation does not require rebuilding LLVM
and changing the compiler cannot silently reuse incompatible PCH state.

## Cutover gate

The default route is reviewable only when:

- a clean build from the pinned source revision and patch set reproduces the
  frozen v9r1 artifact
- the immutable release descriptor and harness-owned consumer manifest agree
  byte-for-byte on every compiler, sysroot, header, PCH, and object identity
- Chromium compiles and runs consecutive source revisions while the compiler
  Worker survives and learner runners retire
- C and C++ generic Project programs cover multi-file compilation, object
  output, linking, nested working directories, and diagnostics
- cancellation, compiler retirement, artifact caching, and exact asset pinning
  have targeted tests
- the product route emits no YoWASP requests

## Default-route promotion gates

TraceCC remains the default route only while:

- C and C++ smoke programs, multi-file projects, diagnostics, and negative
  object/bitcode contract tests pass
- the TraceCode corpus passes through the app-facing provider
- Chromium, Firefox, and WebKit compile/run results agree
- warm compiler and disposable runner isolation tests pass
- cold/warm latency, renderer memory, transferred bytes, and compressed
  download size are reported against the current YoWASP baseline
