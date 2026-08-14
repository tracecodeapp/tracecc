# TraceCC corresponding-source inputs

This directory contains the non-publicly-reconstructible inputs used to build
the packaged TraceCC v9r2 reactor:

- `tracecc-v9r1.profdata.gz` is the deterministic gzip (`gzip -n -9`) of the
  LLVM instrumentation profile recorded by `toolchain/manifest.json`.
- `tracecc-use-clang.list` is the exact LLVM profile-selection list recorded by
  that manifest.

The remaining corresponding source is packaged alongside this directory:

- `toolchain/manifest.json` identifies the public upstream repository and exact
  revision.
- `toolchain/patches/tracecc-v9.patch` contains the TraceCC changes.
- `toolchain/Toolchain-WASI-LLVM.cmake` and `scripts/build-toolchain.sh` contain
  the complete build recipe.

To rebuild, decompress the profile and pass both inputs to the documented build
command:

```sh
gzip -dc source/tracecc-v9r1.profdata.gz > /tmp/tracecc-v9r1.profdata
TRACECC_PGO_PROFILE=/tmp/tracecc-v9r1.profdata \
TRACECC_PGO_LIST="$PWD/source/tracecc-use-clang.list" \
pnpm build:toolchain
```

The build command also requires the WASI SDK and Binaryen versions recorded in
`toolchain/manifest.json` and an LLVM checkout at the recorded public revision.
Their exact release URLs and SHA-256 digests are frozen for supported build
hosts. `pnpm bootstrap:toolchain -- --build` acquires them and runs the same
build without relying on a pre-existing local cache. The build first compiles
the host `llvm-tblgen` and `clang-tblgen` executables from the same pinned LLVM
revision, then uses those tools for the WASI cross-build.
