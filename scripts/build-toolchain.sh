#!/usr/bin/env bash
set -euo pipefail

: "${TRACECC_SOURCE_DIR:?Set TRACECC_SOURCE_DIR to the pinned llvm-project checkout.}"
: "${TRACECC_BUILD_DIR:?Set TRACECC_BUILD_DIR to a dedicated build directory.}"
: "${TRACECC_WASI_SDK:?Set TRACECC_WASI_SDK to WASI SDK 29.0.}"
: "${TRACECC_PGO_PROFILE:?Set TRACECC_PGO_PROFILE to the pinned merged profile.}"
: "${TRACECC_PGO_LIST:?Set TRACECC_PGO_LIST to the pinned profile list.}"
: "${TRACECC_WASM_OPT:?Set TRACECC_WASM_OPT to Binaryen 131 wasm-opt.}"
tracecc_build_jobs="${TRACECC_BUILD_JOBS:-2}"
tracecc_native_tools_dir="${TRACECC_NATIVE_TOOLS_DIR:-${TRACECC_BUILD_DIR}/NATIVE}"
if [[ ! "${tracecc_build_jobs}" =~ ^[1-9][0-9]*$ ]]; then
  echo "TRACECC_BUILD_JOBS must be a positive integer." >&2
  exit 1
fi

tracecc_repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tracecc_manifest="${tracecc_repo_dir}/toolchain/manifest.json"
tracecc_patch="${tracecc_repo_dir}/toolchain/patches/tracecc-v9.patch"
tracecc_toolchain="${tracecc_repo_dir}/toolchain/Toolchain-WASI-LLVM.cmake"

tracecc_expected_revision="$(
  node -e 'console.log(require(process.argv[1]).upstream.revision)' \
    "${tracecc_manifest}"
)"
tracecc_expected_repository="$(
  node -e 'console.log(require(process.argv[1]).upstream.url)' \
    "${tracecc_manifest}"
)"
tracecc_actual_revision="$(git -C "${TRACECC_SOURCE_DIR}" rev-parse HEAD)"
if [[ "${tracecc_actual_revision}" != "${tracecc_expected_revision}" ]]; then
  echo "TraceCC source revision mismatch." >&2
  echo "expected: ${tracecc_expected_revision}" >&2
  echo "actual:   ${tracecc_actual_revision}" >&2
  exit 1
fi

tracecc_verify_sha256() {
  local path="$1"
  local expected="$2"
  local actual
  actual="$(shasum -a 256 "${path}" | awk '{print $1}')"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "TraceCC build input digest mismatch: ${path}" >&2
    echo "expected: ${expected}" >&2
    echo "actual:   ${actual}" >&2
    exit 1
  fi
}

tracecc_verify_sha256 \
  "${TRACECC_PGO_PROFILE}" \
  "$(node -e 'console.log(require(process.argv[1]).buildInputs.pgo.profileSha256)' "${tracecc_manifest}")"
tracecc_verify_sha256 \
  "${TRACECC_PGO_LIST}" \
  "$(node -e 'console.log(require(process.argv[1]).buildInputs.pgo.profileListSha256)' "${tracecc_manifest}")"

if git -C "${TRACECC_SOURCE_DIR}" apply --reverse --check "${tracecc_patch}" 2>/dev/null; then
  :
elif git -C "${TRACECC_SOURCE_DIR}" apply --check "${tracecc_patch}"; then
  git -C "${TRACECC_SOURCE_DIR}" apply "${tracecc_patch}"
else
  echo "TraceCC patch is neither cleanly applicable nor already applied." >&2
  exit 1
fi

cmake -S "${TRACECC_SOURCE_DIR}/llvm" -B "${tracecc_native_tools_dir}" -G Ninja \
  -DCMAKE_BUILD_TYPE=MinSizeRel \
  -DLLVM_FORCE_VC_REVISION="${tracecc_expected_revision}" \
  -DLLVM_FORCE_VC_REPOSITORY="${tracecc_expected_repository}" \
  -DLLVM_ENABLE_PROJECTS=clang \
  -DLLVM_TARGETS_TO_BUILD=WebAssembly \
  -DLLVM_ENABLE_ASSERTIONS=OFF \
  -DLLVM_INCLUDE_TESTS=OFF \
  -DLLVM_INCLUDE_EXAMPLES=OFF \
  -DLLVM_INCLUDE_BENCHMARKS=OFF \
  -DCLANG_INCLUDE_TESTS=OFF

cmake --build "${tracecc_native_tools_dir}" \
  --target llvm-tblgen clang-tblgen -- "-j${tracecc_build_jobs}"

cmake -S "${TRACECC_SOURCE_DIR}/llvm" -B "${TRACECC_BUILD_DIR}" -G Ninja \
  -DCMAKE_BUILD_TYPE=MinSizeRel \
  -DCMAKE_TOOLCHAIN_FILE="${tracecc_toolchain}" \
  -DLLVM_FORCE_VC_REVISION="${tracecc_expected_revision}" \
  -DLLVM_FORCE_VC_REPOSITORY="${tracecc_expected_repository}" \
  -DLLVM_ENABLE_PROJECTS='clang;lld' \
  -DLLVM_TARGETS_TO_BUILD=WebAssembly \
  -DLLVM_DEFAULT_TARGET_TRIPLE=wasm32-wasip1 \
  -DLLVM_ENABLE_ASSERTIONS=OFF \
  -DLLVM_ENABLE_LTO=OFF \
  -DLLVM_INCLUDE_TESTS=OFF \
  -DLLVM_INCLUDE_EXAMPLES=OFF \
  -DLLVM_INCLUDE_BENCHMARKS=OFF \
  -DCLANG_INCLUDE_TESTS=OFF \
  -DLLVM_TABLEGEN="${tracecc_native_tools_dir}/bin/llvm-tblgen" \
  -DCLANG_TABLEGEN="${tracecc_native_tools_dir}/bin/clang-tblgen" \
  -DLLVM_NATIVE_TOOL_DIR="${tracecc_native_tools_dir}/bin" \
  -DLLD_WASM_TRACECC_NO_BITCODE=ON \
  -DCLANG_TRACECC_LEAN_BACKEND=ON \
  -DLLVM_TRACECC_LEAN_WASM_O0=ON

cmake --build "${TRACECC_BUILD_DIR}" --target tracecc-reactor -- \
  "-j${tracecc_build_jobs}"

tracecc_raw="${TRACECC_BUILD_DIR}/bin/tracecc-reactor"
tracecc_output="${TRACECC_OUTPUT_PATH:-${TRACECC_BUILD_DIR}/bin/tracecc-reactor.folded.wasm}"
"${TRACECC_WASM_OPT}" "${tracecc_raw}" -o "${tracecc_output}" \
  --all-features \
  --duplicate-function-elimination \
  --remove-unused-module-elements \
  -g

tracecc_verify_output() {
  local label="$1"
  local path="$2"
  local expected_bytes="$3"
  local expected_sha256="$4"
  local actual_bytes
  local actual_sha256
  actual_bytes="$(wc -c < "${path}" | tr -d '[:space:]')"
  actual_sha256="$(shasum -a 256 "${path}" | awk '{print $1}')"
  if [[ "${actual_bytes}" != "${expected_bytes}" ]] ||
     [[ "${actual_sha256}" != "${expected_sha256}" ]]; then
    echo "TraceCC ${label} output does not match the frozen candidate." >&2
    echo "expected: ${expected_bytes} bytes ${expected_sha256}" >&2
    echo "actual:   ${actual_bytes} bytes ${actual_sha256}" >&2
    exit 1
  fi
  echo "${label}: ${actual_bytes} bytes ${actual_sha256}"
}

tracecc_verify_output \
  "raw" \
  "${tracecc_raw}" \
  "$(node -e 'console.log(require(process.argv[1]).candidate.rawBytes)' "${tracecc_manifest}")" \
  "$(node -e 'console.log(require(process.argv[1]).candidate.rawSha256)' "${tracecc_manifest}")"
tracecc_verify_output \
  "folded" \
  "${tracecc_output}" \
  "$(node -e 'console.log(require(process.argv[1]).candidate.foldedBytes)' "${tracecc_manifest}")" \
  "$(node -e 'console.log(require(process.argv[1]).candidate.foldedSha256)' "${tracecc_manifest}")"
