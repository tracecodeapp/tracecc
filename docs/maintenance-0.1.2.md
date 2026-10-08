# 0.1.2 maintenance consumer release

This release stays on the `v0.1.0` API and consumer format v1. It rebuilds the
three header-specific PCH profiles and matching objects for Harness's recursive
JSON portability fix, without rebuilding or replacing the engine compiler.
The separate unreleased v2 development line must use a distinct future version.

Inputs:

- Harness header commit `b08d08760c995f43fd58af55b8d1c4487f014b14`.
- Header SHA-256 `6ba21c2b9959ab6d46c5162dd7b31a73b1b7b729e9247c277817b4638c0791d1`.
- Reactor SHA-256 `02de34842538466bf29e9d6cf14cd0d5e5ff519c9ba390561ccb158105d44d41`.
- Resources SHA-256 `d95d2a2bc8408a16c0744996ac47c91bb3c63bb71b94315c9796089b6dda8555`.
- PCH builder `22.0.0-release-noassert-wasm32-frontend.0`, with the original
  pinned compiler bundle and matching resources.

Use the sequential three-profile recipe in `tracecode-pch-shards.md`, including
smoke consumption for every profile. The v1 Harness `prepare:tracecc-assets`
assembler records the original toolchain identity and ordered hashes of all
new header/profile files. Import that immutable consumer directory with
`TRACECC_CONSUMER_RELEASE_DIR=<directory> pnpm prepare:package-runtime`, then
run `pnpm test`, `pnpm verify:package`, and inspect the packed consumer.
Build caches and generated provenance sidecars stay outside the package tree;
`runtime-release/` retains the checked-in immutable payload and consumer lock,
as required by the existing package protocol.
