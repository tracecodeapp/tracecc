if("$ENV{TRACECC_WASI_SDK}" STREQUAL "")
  message(FATAL_ERROR "TRACECC_WASI_SDK is required")
endif()
if("$ENV{TRACECC_PGO_PROFILE}" STREQUAL "")
  message(FATAL_ERROR "TRACECC_PGO_PROFILE is required for the frozen v9r1 build")
endif()
if("$ENV{TRACECC_PGO_LIST}" STREQUAL "")
  message(FATAL_ERROR "TRACECC_PGO_LIST is required for the frozen v9r1 build")
endif()

set(CMAKE_SYSTEM_NAME WASI)
set(CMAKE_SYSTEM_VERSION 1)
set(CMAKE_SYSTEM_PROCESSOR wasm32)

set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)

set(CMAKE_C_COMPILER "$ENV{TRACECC_WASI_SDK}/bin/clang")
set(CMAKE_C_COMPILER_TARGET wasm32-wasip1)
set(CMAKE_CXX_COMPILER "$ENV{TRACECC_WASI_SDK}/bin/clang++")
set(CMAKE_CXX_COMPILER_TARGET wasm32-wasip1)
set(CMAKE_LINKER "$ENV{TRACECC_WASI_SDK}/bin/wasm-ld")
set(CMAKE_AR "$ENV{TRACECC_WASI_SDK}/bin/ar")
set(CMAKE_RANLIB "$ENV{TRACECC_WASI_SDK}/bin/ranlib")

set(TRACECC_COMMON_FLAGS
  "--sysroot=$ENV{TRACECC_WASI_SDK}/share/wasi-sysroot -mcpu=lime1 -D_WASI_EMULATED_MMAN -flto=full -fprofile-instr-use=$ENV{TRACECC_PGO_PROFILE} -fprofile-list=$ENV{TRACECC_PGO_LIST}"
)
set(CMAKE_C_FLAGS "${TRACECC_COMMON_FLAGS}")
set(CMAKE_CXX_FLAGS "${TRACECC_COMMON_FLAGS}")
set(CMAKE_EXE_LINKER_FLAGS
  "--sysroot=$ENV{TRACECC_WASI_SDK}/share/wasi-sysroot -lwasi-emulated-mman -Wl,--max-memory=4294967296 -Wl,-z,stack-size=8388608,--stack-first -Wl,--strip-all -flto=full -fprofile-instr-use=$ENV{TRACECC_PGO_PROFILE} -fprofile-list=$ENV{TRACECC_PGO_LIST}"
)
