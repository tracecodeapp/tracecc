export const TRACECC_COMPILE_PROTOCOL_VERSION = "tracecc-compile-v1";
export const TRACECC_TOOLCHAIN_RELEASE_PROTOCOL_VERSION =
  "tracecc-toolchain-release-v1";

export type TraceCCLanguage = "c17" | "c++23";

export interface TraceCCArtifactDescriptor {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly integrity: string;
  readonly mediaType: string;
}

export interface TraceCCToolchainRelease {
  readonly protocolVersion:
    typeof TRACECC_TOOLCHAIN_RELEASE_PROTOCOL_VERSION;
  readonly toolchainVersion: string;
  readonly contentHash: string;
  readonly compilerAbi: string;
  readonly target: "wasm32-wasip1";
  readonly artifacts: Readonly<{
    reactor: TraceCCArtifactDescriptor;
    resources: TraceCCArtifactDescriptor;
  }>;
  readonly source: Readonly<{
    upstreamUrl: string;
    upstreamRevision: string;
    patchSha256: string;
  }>;
}

export interface TraceCCCompileRequest {
  readonly protocolVersion: typeof TRACECC_COMPILE_PROTOCOL_VERSION;
  readonly language: TraceCCLanguage;
  readonly sourcePath: string;
  readonly source: string;
  readonly objectPath: string;
  readonly outputPath: string;
  readonly sysrootPath: string;
  readonly pchPath?: string;
  readonly runtimeObjects?: readonly string[];
  readonly librarySearchPaths?: readonly string[];
  readonly libraries?: readonly string[];
  readonly stackBytes?: number;
}

export interface TraceCCCompileResult {
  readonly status: "completed" | "failed" | "cancelled";
  readonly program?: Uint8Array;
  readonly stdout: string;
  readonly stderr: string;
  readonly timings: Readonly<{
    queueMs: number;
    compileMs: number;
    linkMs: number;
    totalMs: number;
  }>;
}

function assertRelativeOrRootedPath(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    throw new TypeError(`${label} must be a non-empty POSIX path.`);
  }
  const segments = value.split("/");
  if (segments.some((segment, index) =>
    segment === "." || segment === ".." ||
    (segment === "" && index !== 0)
  )) {
    throw new TypeError(`${label} must be normalized.`);
  }
  return value;
}

function assertBoundedArray(
  value: unknown,
  label: string,
  maximum: number,
): asserts value is readonly unknown[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > maximum) {
    throw new TypeError(`${label} must contain at most ${maximum} entries.`);
  }
}

function assertLinkerPath(value: unknown, label: string): string {
  const path = assertRelativeOrRootedPath(value, label);
  if (path.startsWith("-") || path.startsWith("@")) {
    throw new TypeError(`${label} must be a path, not a linker option.`);
  }
  return path;
}

function normalizeLibraryName(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a library name.`);
  }
  const name = value.startsWith("-l") ? value.slice(2) : value;
  if (!/^[A-Za-z0-9_+][A-Za-z0-9_+.-]*$/u.test(name)) {
    throw new TypeError(`${label} must be a plain library name.`);
  }
  return name;
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 hex digest.`);
  }
}

function assertArtifact(
  value: unknown,
  label: string,
): asserts value is TraceCCArtifactDescriptor {
  if (!value || typeof value !== "object") {
    throw new TypeError(`${label} must be an artifact descriptor.`);
  }
  const artifact = value as Partial<TraceCCArtifactDescriptor>;
  assertRelativeOrRootedPath(artifact.path, `${label}.path`);
  if (!Number.isSafeInteger(artifact.bytes) || Number(artifact.bytes) <= 0) {
    throw new TypeError(`${label}.bytes must be a positive safe integer.`);
  }
  assertSha256(artifact.sha256, `${label}.sha256`);
  if (
    typeof artifact.integrity !== "string" ||
    !artifact.integrity.startsWith("sha256-")
  ) {
    throw new TypeError(`${label}.integrity must contain SHA-256 SRI.`);
  }
  if (typeof artifact.mediaType !== "string" || artifact.mediaType.length === 0) {
    throw new TypeError(`${label}.mediaType must be non-empty.`);
  }
}

export function assertTraceCCToolchainRelease(
  value: unknown,
): asserts value is TraceCCToolchainRelease {
  if (!value || typeof value !== "object") {
    throw new TypeError("TraceCC release must be an object.");
  }
  const release = value as Partial<TraceCCToolchainRelease>;
  if (
    release.protocolVersion !== TRACECC_TOOLCHAIN_RELEASE_PROTOCOL_VERSION ||
    release.target !== "wasm32-wasip1" ||
    typeof release.toolchainVersion !== "string" ||
    release.toolchainVersion.length === 0 ||
    typeof release.compilerAbi !== "string" ||
    release.compilerAbi.length === 0
  ) {
    throw new TypeError("TraceCC release identity is invalid.");
  }
  assertSha256(release.contentHash, "contentHash");
  assertArtifact(release.artifacts?.reactor, "artifacts.reactor");
  assertArtifact(release.artifacts?.resources, "artifacts.resources");
  if (
    !release.source ||
    typeof release.source.upstreamUrl !== "string" ||
    typeof release.source.upstreamRevision !== "string"
  ) {
    throw new TypeError("TraceCC corresponding-source metadata is missing.");
  }
  assertSha256(release.source.patchSha256, "source.patchSha256");
}

export function assertTraceCCCompileRequest(
  value: unknown,
): asserts value is TraceCCCompileRequest {
  if (!value || typeof value !== "object") {
    throw new TypeError("TraceCC compile request must be an object.");
  }
  const request = value as Partial<TraceCCCompileRequest>;
  if (request.protocolVersion !== TRACECC_COMPILE_PROTOCOL_VERSION) {
    throw new TypeError("Unsupported TraceCC compile protocol.");
  }
  if (request.language !== "c17" && request.language !== "c++23") {
    throw new TypeError("TraceCC language must be c17 or c++23.");
  }
  if (typeof request.source !== "string") {
    throw new TypeError("TraceCC source must be a string.");
  }
  for (const [label, path] of [
    ["sourcePath", request.sourcePath],
    ["objectPath", request.objectPath],
    ["outputPath", request.outputPath],
    ["sysrootPath", request.sysrootPath],
  ] as const) {
    assertRelativeOrRootedPath(path, label);
  }
  if (request.pchPath !== undefined) {
    assertRelativeOrRootedPath(request.pchPath, "pchPath");
  }
  assertBoundedArray(request.runtimeObjects, "runtimeObjects", 256);
  request.runtimeObjects?.forEach((path, index) => {
    assertLinkerPath(path, `runtimeObjects[${index}]`);
  });
  assertBoundedArray(request.librarySearchPaths, "librarySearchPaths", 64);
  request.librarySearchPaths?.forEach((path, index) => {
    assertLinkerPath(path, `librarySearchPaths[${index}]`);
  });
  assertBoundedArray(request.libraries, "libraries", 128);
  request.libraries?.forEach((library, index) => {
    normalizeLibraryName(library, `libraries[${index}]`);
  });
  if (
    request.stackBytes !== undefined &&
    (!Number.isSafeInteger(request.stackBytes) ||
      request.stackBytes < 64 * 1024 ||
      request.stackBytes > 64 * 1024 * 1024)
  ) {
    throw new TypeError("TraceCC stackBytes is outside the supported range.");
  }
}

export function traceCCFrontendArguments(
  request: TraceCCCompileRequest,
): readonly string[] {
  assertTraceCCCompileRequest(request);
  return [
    request.language === "c++23" ? "tracecc-cxx" : "tracecc-c",
    request.sourcePath,
    request.objectPath,
    request.sysrootPath,
    ...(request.pchPath ? [request.pchPath] : []),
  ];
}

export function traceCCLinkerArguments(
  request: TraceCCCompileRequest,
): readonly string[] {
  assertTraceCCCompileRequest(request);
  return [
    "wasm-ld",
    "-m",
    "wasm32",
    ...((request.librarySearchPaths ?? []).map((path) => `-L${path}`)),
    request.objectPath,
    ...(request.runtimeObjects ?? []),
    "-z",
    `stack-size=${request.stackBytes ?? 8 * 1024 * 1024}`,
    ...((request.libraries ?? []).map((library, index) =>
      `-l${normalizeLibraryName(library, `libraries[${index}]`)}`
    )),
    "-o",
    request.outputPath,
  ];
}
