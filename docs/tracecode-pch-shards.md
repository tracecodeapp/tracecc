# TraceCode runtime PCH shard regeneration

The harness browser runtime compiles learner C++ against precompiled-header
(PCH) shards plus matching runtime objects built from the harness-owned
`workers/cpp/tracecode_runtime.hpp`. Any change to that header is **inert in
production until these shards are rebuilt** and the harness asset manifest is
repinned: the harness compiler service strips the header include and
substitutes the PCH, and the shard runtime objects carry the header's template
instantiations.

Everything needed to regenerate lives in this repository:

- `toolchain/pch-compiler/` — the pinned PCH-builder compiler bundle
  (`22.0.0-release-noassert-wasm32-frontend.0`, a YoWASP-style clang bundle;
  `llvm.core.wasm` sha256 `c0a51aa19e7809e84303fac072318893dfd7beeffd2d6045
  0f1f2b035f75143d` is recorded in every shard's `.json` sidecar). This is the
  frontend used to *build* PCHs; it is not the runtime reactor. Provenance:
  built by the traceclang-experiments matrix (variant
  `release-noassert-wasm32-frontend`); it must stay clang-major-compatible
  with the shipped reactor.
- `scripts/build-runtime-pch.mjs` — builds one shard PCH (+`.source.hpp`
  anchor TU and `.json` metadata sidecar).
- `scripts/build-runtime-pch-object.mjs` — builds the shard's runtime object
  from the PCH and its anchor source.
- `scripts/validate-runtime-pch.mjs` — smoke-consumes a PCH with the matching
  compiler and requires a non-empty object result.

## Rebuild procedure

The compiler bundle expects `llvm-resources.tar` next to `bundle.js`; it is
byte-identical to every release's `llvm-resources.tar`, so copy it in rather
than duplicating it in git:

```sh
RUNTIME_DIR=$(node -e 'const m = require("./runtime-release/manifest.json"); process.stdout.write(`runtime-release/${m.consumerHash}`)')
cp "$RUNTIME_DIR/llvm-resources.tar" toolchain/pch-compiler/
```

Build all three shards from the harness header (flags recorded in the
sidecars: `-std=c++23 -O0 -fno-exceptions -fpch-instantiate-templates
-fpch-codegen`):

```sh
HEADER=<harness>/workers/cpp/tracecode_runtime.hpp
OUT=<shards-output-dir>
for shard in common corpus maps; do
  case $shard in
    common) anchor=TRACECODE_CPP_PCH_COMMON_TYPES ;;
    corpus) anchor=TRACECODE_CPP_PCH_CORPUS_TYPES ;;
    maps)   anchor=TRACECODE_CPP_PCH_MAP_TYPES ;;
  esac
  env TRACECODE_CPP_PCH_INSTANTIATE_TEMPLATES=1 TRACECODE_CPP_PCH_CODEGEN=1 "$anchor=1" \
    node scripts/build-runtime-pch.mjs toolchain/pch-compiler "$HEADER" \
    "$OUT/tracecode_pch-codegen-$shard-event-helpers-v2.hpp.pch"
  node scripts/build-runtime-pch-object.mjs toolchain/pch-compiler "$HEADER" \
    "$OUT/tracecode_pch-codegen-$shard-event-helpers-v2.hpp.pch.source.hpp" \
    "$OUT/tracecode_pch-codegen-$shard-event-helpers-v2.hpp.pch" \
    "$OUT/tracecode_pch-$shard-event-helpers-v2.o"
done
```

Smoke-consume each generated PCH with its exact anchor source before handing
the shards to the harness:

```sh
for shard in common corpus maps; do
  node scripts/validate-runtime-pch.mjs toolchain/pch-compiler "$HEADER" \
    "$OUT/tracecode_pch-codegen-$shard-event-helpers-v2.hpp.pch.source.hpp" \
    "$OUT/tracecode_pch-codegen-$shard-event-helpers-v2.hpp.pch"
done
```

Shard-to-asset mapping in the harness manifest: `common` → `narrow`,
`corpus` → `broad`, `maps` → `map`.

## Publishing into the harness

In the harness repository:

```sh
TRACECC_RELEASE_DIR=<tracecc>/.cache/releases/<version>/<release-hash> \
TRACECC_PCH_DIR=$OUT \
pnpm prepare:tracecc-assets
```

The release must be the one whose `tracecc-reactor.wasm` digest matches the
`compilerWasm` integrity pinned in
`packages/runtime-cpp/src/tracecc-runtime-assets.ts`. On first run the script
reports the new consumer content hash; update `TRACECC_RUNTIME_CONTENT_HASH`
and the per-file `integrity`/`size` entries in that file (the script verifies
its generated manifest equals `createTraceCCRuntimeManifest`), rerun, and
publish the emitted `.cache/tracecc-runtime-assets/<hash>/` directory at
`/workers/cpp/tracecc/<hash>/`.
