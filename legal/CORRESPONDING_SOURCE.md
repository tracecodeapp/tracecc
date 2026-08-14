# Corresponding source

The browser compiler in a TraceCC release is reproducible from:

1. the upstream URL and exact Git revision in `toolchain/manifest.json`
2. `toolchain/patches/tracecc-v9.patch`
3. `scripts/build-toolchain.sh`
4. `toolchain/Toolchain-WASI-LLVM.cmake`
5. the WASI SDK, Binaryen, PGO profile, and profile-list versions/digests
   recorded in the manifest
6. `scripts/bootstrap-toolchain.mjs`, which fetches and verifies the exact
   platform archives and upstream checkout before invoking the frozen build;
   the recipe also builds its native TableGen tools from that checkout

The npm package includes the exact profile as the deterministic compressed file
`source/tracecc-v9r1.profdata.gz` and the exact profile list as
`source/tracecc-use-clang.list`. It also includes the downstream patch, source
manifest, and complete build recipe. The upstream source remains available at
the public URL and immutable Git revision recorded in that manifest.

On macOS arm64/x64 or Linux arm64/x64, a clean checkout can acquire every
external input and reproduce the frozen reactor with:

```sh
pnpm bootstrap:toolchain -- --build
```
