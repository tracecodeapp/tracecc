# Corresponding source

The browser compiler in a TraceCC release is reproducible from:

1. the upstream URL and exact Git revision in `source/manifest.json`
2. `source/tracecc.patch`
3. `source/build-toolchain.sh`
4. `source/Toolchain-WASI-LLVM.cmake`
5. the WASI SDK, Binaryen, PGO profile, and profile-list versions/digests
   recorded in the manifest

The PGO profile is a build input, not a runtime download. A publishable release
must make that exact profile and profile-list available in its source release
or at immutable digest-addressed source URLs. The private v9r1 prototype is not a
public corresponding-source release until that archival step is complete.
