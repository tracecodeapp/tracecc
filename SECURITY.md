# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities through
[GitHub private vulnerability reporting](https://github.com/tracecodeapp/tracecc/security/advisories/new).

Do not open a public issue, pull request, or discussion containing vulnerability
details.

Security fixes target the latest pre-release version and its immutable toolchain
release.

## What TraceCC defends

TraceCC compiles C and C++ inside a browser Worker, and assumes every request is
attacker-controlled: source, paths, object files, library names, manifests, and
downloaded assets can all be hostile.

Breaking any of these invariants is a vulnerability:

- Request paths cannot use traversal, and linker inputs cannot inject raw
  options or response files.
- Release paths stay inside their release root and do not follow symlinks.
- Executable assets match their pinned byte size and SHA-256 digest.
- Resource limits and Worker isolation cannot be bypassed.

In scope: request validation, compiler and linker argument construction, virtual
filesystem access, immutable release preparation and verification, and
package-owned runtime assets.

## What TraceCC does not defend

TraceCC is a library, not a hosted compilation service, and it never runs the
code it compiles.

You own request admission, path-to-mount policy, source and time limits, browser
isolation headers, Worker termination, self-hosted asset delivery, and the
sandbox that executes compiled output. A weakness in your own execution sandbox
is not a TraceCC vulnerability — see
[Security and status](README.md#security-and-status) in the README for where the
line falls.

Compiler compatibility defects with no security impact are ordinary bugs; please
file them as issues. Upstream LLVM issues are reportable here when TraceCC makes
them reachable and they affect the documented browser boundary.
