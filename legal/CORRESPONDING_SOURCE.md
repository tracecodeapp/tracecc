# Corresponding source

The browser compiler in a TraceCC release is reproducible from:

1. the upstream URL and exact Git revision in `toolchain/manifest.json`
2. `toolchain/patches/tracecc-v9.patch`
3. `scripts/build-toolchain.sh`
4. `toolchain/Toolchain-WASI-LLVM.cmake`
5. the WASI SDK, Binaryen, PGO profile, and profile-list versions/digests
   recorded in the manifest

The npm package includes the exact profile as the deterministic compressed file
`source/tracecc-v9r1.profdata.gz` and the exact profile list as
`source/tracecc-use-clang.list`. It also includes the downstream patch, source
manifest, and complete build recipe. The upstream source remains available at
the public URL and immutable Git revision recorded in that manifest.
