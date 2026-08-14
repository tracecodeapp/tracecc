# Consumer release regeneration

How to rebuild the precompiled-header layer and assemble a consumer release.
This is a maintainer procedure — to *use* TraceCC, see the
[README](../README.md) instead.

TraceCC compiles against three precompiled-header profiles plus matching
runtime objects. The canonical header and every build tool needed to regenerate
them are owned by this repository.

## Inputs

- `runtime/tracecode_runtime.hpp` — canonical runtime header.
- `toolchain/pch-compiler/` — pinned PCH-builder compiler bundle.
- `scripts/build-runtime-pch.mjs` — builds one PCH and anchor source.
- `scripts/build-runtime-pch-object.mjs` — builds its matching runtime object.
- `scripts/validate-runtime-pch.mjs` — smoke-consumes a generated PCH.
- a verified base toolchain release produced by `pnpm prepare:release`.

The PCH compiler's `llvm-resources.tar` must match the base toolchain resources.
Copy it from the verified base release when preparing a clean build.
Each build command also emits a JSON provenance sidecar. The consumer-release
assembler requires those sidecars and verifies the complete compiler-resource
inventory, sysroot, header, profile, source, PCH, and runtime-object identities
before copying any shard.

## Build the profiles

```sh
HEADER=$PWD/runtime/tracecode_runtime.hpp
PCH_COMPILER=$PWD/toolchain/pch-compiler
OUT=$PWD/.cache/tracecc-pch

mkdir -p "$OUT"
for profile in narrow broad map; do
  case $profile in
    narrow) anchor=TRACECODE_CPP_PCH_COMMON_TYPES ;;
    broad)  anchor=TRACECODE_CPP_PCH_CORPUS_TYPES ;;
    map)    anchor=TRACECODE_CPP_PCH_MAP_TYPES ;;
  esac
  env TRACECODE_CPP_PCH_INSTANTIATE_TEMPLATES=1 \
      TRACECODE_CPP_PCH_CODEGEN=1 \
      "$anchor=1" \
    node scripts/build-runtime-pch.mjs \
      "$PCH_COMPILER" "$HEADER" "$OUT/$profile.pch"
  node scripts/build-runtime-pch-object.mjs \
    "$PCH_COMPILER" "$HEADER" "$OUT/$profile.pch.source.hpp" \
    "$OUT/$profile.pch" "$OUT/$profile.o"
  node scripts/validate-runtime-pch.mjs \
    "$PCH_COMPILER" "$HEADER" "$OUT/$profile.pch.source.hpp" \
    "$OUT/$profile.pch"
done
```

## Assemble the immutable consumer release

```sh
TRACECC_TOOLCHAIN_RELEASE_DIR=/path/to/verified/base-release \
TRACECC_PCH_DIR=$PWD/.cache/tracecc-pch \
  pnpm prepare:consumer-release
```

The assembler verifies the base release, copies only regular files, hashes the
compiler, sysroot, header, PCHs, anchor sources, and runtime objects in a fixed
order, and writes:

- `tracecc-consumer-lock.json`, the complete content and toolchain identity;
- `tracecc-runtime-manifest.json`, route-neutral relative asset descriptors.

The output directory name is the consumer content hash. Import it into the npm
package only as an explicit release operation:

```sh
TRACECC_CONSUMER_RELEASE_DIR=/path/to/consumer-release \
  pnpm prepare:package-runtime
pnpm test
pnpm verify:package
```

The manifest deliberately contains no CDN origin, application route, or Worker
URL. Embedders install the immutable directory at an origin and path they
control, then resolve every relative asset name against that chosen base URL.
