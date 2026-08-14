# Contributing to TraceCC

Thanks for your interest in TraceCC.

TraceCC's request boundary and its generated LLVM/Clang/LLD assets are security-
and compatibility-sensitive, so small, focused changes with explicit tests are
much easier to review and land than large ones.

## Getting set up

You need Node.js 22 or newer and pnpm 10.22.0.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm verify:package
```

That covers the TypeScript package and the release-manifest logic, and checks
the packaged runtime assets against their recorded hashes. None of it needs the
large generated compiler artifacts.

## Before opening a pull request

1. **Open an issue first** for any large change to the API, architecture,
   toolchain, or release format. It saves you from building something that
   turns out to conflict with the fixed compiler contract.
2. Run `pnpm test`, and `pnpm verify:package` for anything that touches
   package-facing files.
3. Add a regression test for every bug fix and security fix.
4. Keep commits atomic, and commit generated manifests and archives separately
   from source changes.
5. In the pull request description, explain the compatibility, licensing, and
   security effects of the change.

Do not commit generated caches, downloaded build trees, credentials, or
deployment configuration.

## Building the toolchain from source

Nothing above requires rebuilding the compiler. To reproduce the WebAssembly
toolchain itself, you need the pinned LLVM checkout and build inputs named in
`toolchain/manifest.json`:

```sh
pnpm bootstrap:toolchain -- --build
```

That verifies the upstream Git revision, WASI SDK archive, Binaryen archive,
packaged PGO profile, and profile list before building. Pass
`--root=/path/on/a/large/disk` to keep the checkout and build directory off the
system disk.

Toolchain changes must use those pinned inputs and the scripts in this
repository. Nothing else is supported.

## Cutting a release

A release has two layers. The **base toolchain release** is the reactor,
sysroot, descriptor, legal material, and patches. The **consumer release** is
that base plus the runtime header, PCH profiles, runtime objects, a content
lock, and the route-neutral asset manifest. `prepare:release` produces only the
first:

```sh
TRACECC_REACTOR_PATH=/path/to/tracecc-reactor.folded.wasm \
TRACECC_RESOURCES_PATH=/path/to/llvm-resources.tar \
TRACECC_PATCH_PATH=toolchain/patches/tracecc-v9.patch \
TRACECC_LLVM_LICENSE_PATH=legal/LLVM-LICENSE.TXT \
  pnpm prepare:release
TRACECC_RELEASE_DIR=/path/to/generated/base-release pnpm verify:release
```

[docs/consumer-release.md](docs/consumer-release.md) covers the rest: building
the PCH profiles and runtime objects, assembling the consumer release against
that verified base, and importing the result into the npm package.

## Reference

- [README.md](README.md) — what TraceCC is and how to embed it
- [docs/architecture.md](docs/architecture.md) — ownership boundaries and the
  versioning contract
- [SECURITY.md](SECURITY.md) — report vulnerabilities privately, never in a
  public issue or pull request

## Licensing

By contributing, you agree that your contribution is licensed under this
repository's AGPL-3.0-only license.
