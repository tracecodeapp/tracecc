# Security Policy

## Reporting

Report suspected vulnerabilities through GitHub private vulnerability
reporting. Do not open a public issue containing vulnerability details.

## Supported Versions

Security fixes target the latest pre-release version and its immutable
toolchain release.

## System and Scope

TraceCC compiles attacker-controlled C and C++ requests inside a browser
Worker. Covered surfaces include request validation, compiler/linker argument
construction, virtual filesystem access, immutable release preparation and
verification, and package-owned runtime assets.

## Threat Model and Security Invariants

- Source, paths, object files, library names, manifests, and downloaded assets
  may be attacker-controlled.
- Requests must not inject compiler/linker options or escape approved roots.
- Release paths must remain inside their release root and must not follow
  symlinks.
- Executable assets must match their pinned size and SHA-256 metadata.
- Resource-limit or Worker-isolation bypasses are reportable.

## Out of Scope and Known Limitations

TraceCC is a library, not a hosted compilation service. Embedders own request
admission, browser headers, Worker termination, and self-hosted asset delivery.
Compiler compatibility defects without a security-boundary impact are ordinary
bugs. Upstream LLVM issues are reportable here when TraceCC makes them reachable
and they affect the documented browser boundary.
