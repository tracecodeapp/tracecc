# Contributing to TraceCC

TraceCC is a pre-release browser C/C++ compiler. Its request boundary and
generated LLVM/Clang/LLD assets are security- and compatibility-sensitive, so
small, reviewable changes with explicit tests are easiest to land.

## Before opening a pull request

1. Open an issue before a large API, architecture, toolchain, or release format
   change.
2. Install Node.js 22 and pnpm 10.22.0.
3. Run `pnpm install --frozen-lockfile` and `pnpm test`.
4. Run `pnpm verify:package` for package-facing changes.
5. Add a regression test for bug and security fixes.

Toolchain changes must use the pinned inputs in `toolchain/manifest.json` and
the repository scripts. The base toolchain and consumer release are separate
artifacts; `prepare:release` does not produce the PCH/runtime-object layer.

Create and verify the base toolchain release with explicit build outputs:

```sh
TRACECC_REACTOR_PATH=/path/to/tracecc-reactor.folded.wasm \
TRACECC_RESOURCES_PATH=/path/to/llvm-resources.tar \
TRACECC_PATCH_PATH=toolchain/patches/tracecc-v9.patch \
TRACECC_LLVM_LICENSE_PATH=legal/LLVM-LICENSE.TXT \
  pnpm prepare:release
TRACECC_RELEASE_DIR=/path/to/generated/base-release pnpm verify:release
```

Build the PCH profiles and runtime objects from
`runtime/tracecode_runtime.hpp` as documented in
`docs/consumer-release.md`. Assemble them with the verified toolchain release:

```sh
TRACECC_TOOLCHAIN_RELEASE_DIR=/path/to/generated/base-release \
TRACECC_PCH_DIR=/path/to/generated-pch-files \
  pnpm prepare:consumer-release
```

The result contains `tracecc-consumer-lock.json` and
`tracecc-runtime-manifest.json`. Import that complete release with:

```sh
TRACECC_CONSUMER_RELEASE_DIR=/path/to/consumer-release \
  pnpm prepare:package-runtime
pnpm verify:package
```

See `README.md`, `docs/architecture.md`, and `docs/consumer-release.md` for the
complete release contract. Commit generated manifests and archives separately
from source changes.

Do not commit generated caches, downloaded build trees, credentials, or private
deployment configuration. Keep commits atomic and explain compatibility,
licensing, and security effects in the pull request.

By contributing, you agree that your contribution is licensed under the
repository's AGPL-3.0-only license.
