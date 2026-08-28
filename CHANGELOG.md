# Changelog

This project follows semantic versioning while it remains pre-1.0. Dates and
release notes are published with GitHub and npm releases.

## Unreleased

- Authenticate result, trace-status, and trace-event stdout markers with
  embedder-supplied per-run tokens.
- Retain the browser-proven v9r1 reactor after integration testing exposed a
  command-execution trap in the unreleased v9r2 candidate.
- Make the 0.1.1 toolchain release reproducible from pinned repository inputs.
- Confine release manifest paths and compiler/linker request paths.
- Restrict linker inputs to supported object paths and library names.
