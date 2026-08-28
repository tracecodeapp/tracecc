#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [compilerDirectoryArg, runtimeHeaderPathArg, pchSourcePathArg, pchPathArg] =
  process.argv.slice(2);
if (
  !compilerDirectoryArg ||
  !runtimeHeaderPathArg ||
  !pchSourcePathArg ||
  !pchPathArg
) {
  throw new Error(
    "Usage: validate-runtime-pch.mjs <compiler-directory> <runtime-header> <pch-source> <pch>",
  );
}

const compilerDirectory = resolve(compilerDirectoryArg);
const runtimeHeaderPath = resolve(runtimeHeaderPathArg);
const pchSourcePath = resolve(pchSourcePathArg);
const pchPath = resolve(pchPathArg);
const compiler = await import(
  pathToFileURL(resolve(compilerDirectory, 'bundle.js')).href
);
const runtimeHeader = await readFile(runtimeHeaderPath, 'utf8');
const pchSource = await readFile(pchSourcePath, 'utf8');
const pch = new Uint8Array(await readFile(pchPath));
const stderr = [];
const startedAt = performance.now();

let files;
try {
  // The vendored Clang wrapper's first internal dry run otherwise falls back
  // to its upstream progress logger. Prefetch quietly so TraceCC owns its CLI
  // output and diagnostics.
  await compiler.runLLVM(null, {}, { fetchProgress: () => {} });
  files = await compiler.runClang(
    [
      'clang++',
      '-std=c++23',
      '-O0',
      '-fno-exceptions',
      '-include-pch',
      'tracecode_pch.hpp.pch',
      '-c',
      'main.cpp',
      '-o',
      'main.o',
    ],
    {
      'tracecode_pch.hpp': pchSource,
      'tracecode_runtime.hpp': runtimeHeader,
      'tracecode_pch.hpp.pch': pch,
      'main.cpp': [
        'int main(int argc, char** argv) {',
        '  tracecode::configure_result_marker_token(argc > 1 ? argv[1] : "");',
        '  tracecode::configure_trace_marker_token(argc > 2 ? argv[2] : "");',
        '  tracecode::write_result_json_raw("42");',
        '  tracecode::configure_result_marker_token("");',
        '  tracecode::configure_trace_marker_token("");',
        '  return 0;',
        '}',
        '',
      ].join('\n'),
    },
    {
      fetchProgress: () => {},
      stdout: () => {},
      stderr: (chunk) => {
        if (chunk) stderr.push(new Uint8Array(chunk));
      },
    }
  );
} catch (error) {
  const diagnostic = new TextDecoder().decode(
    Buffer.concat(stderr.map((chunk) => Buffer.from(chunk)))
  );
  const returnedFiles =
    error && typeof error === 'object' && 'files' in error && error.files
      ? Object.entries(error.files).map(([name, value]) => ({
          name,
          type: Object.prototype.toString.call(value),
          bytes:
            typeof value?.byteLength === 'number'
              ? value.byteLength
              : typeof value?.length === 'number'
                ? value.length
                : null,
        }))
      : [];
  throw new Error(
    `${String(error)}\n${diagnostic}\nReturned files: ${JSON.stringify(returnedFiles)}`
  );
}

const objectFile = files?.['main.o'];
if (!ArrayBuffer.isView(objectFile) || objectFile.byteLength === 0) {
  throw new Error('PCH validation compile did not produce main.o');
}

console.log(
  JSON.stringify(
    {
      compilerVersion: compiler.version,
      compileMs: Math.round((performance.now() - startedAt) * 10) / 10,
      objectBytes: objectFile.byteLength,
      pchBytes: pch.byteLength,
    },
    null,
    2
  )
);
