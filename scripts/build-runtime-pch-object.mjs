#!/usr/bin/env node

import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const compilerDirectory = resolve(process.argv[2]);
const runtimeHeaderPath = resolve(process.argv[3]);
const pchSourcePath = resolve(process.argv[4]);
const pchPath = resolve(process.argv[5]);
const outputPath = resolve(process.argv[6]);
const compiler = await import(
  pathToFileURL(resolve(compilerDirectory, 'bundle.js')).href
);
const pch = new Uint8Array(await readFile(pchPath));
const runtimeHeader = await readFile(runtimeHeaderPath, 'utf8');
const pchSource = await readFile(pchSourcePath, 'utf8');
const stderr = [];
const startedAt = performance.now();

let files;
try {
  files = await compiler.runClang(
    [
      'clang++',
      '-std=c++23',
      '-O0',
      '-fno-exceptions',
      '-c',
      '-fintegrated-as',
      'tracecode_pch.hpp.pch',
      '-o',
      'tracecode_pch.o',
    ],
    {
      'tracecode_pch.hpp': pchSource,
      'tracecode_runtime.hpp': runtimeHeader,
      'tracecode_pch.hpp.pch': pch,
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
  throw new Error(
    [
      `TraceClang PCH object generation exited unsuccessfully: ${String(error)}`,
      diagnostic.trim(),
    ].filter(Boolean).join('\n')
  );
}

const objectValue = files?.['tracecode_pch.o'];
const objectBytes = ArrayBuffer.isView(objectValue)
  ? new Uint8Array(
      objectValue.buffer,
      objectValue.byteOffset,
      objectValue.byteLength
    )
  : null;
if (!objectBytes) {
  throw new Error('TraceClang PCH object generation did not produce tracecode_pch.o');
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, objectBytes);
const metadata = {
  compilerVersion: compiler.version,
  generationMs: Math.round((performance.now() - startedAt) * 10) / 10,
  bytes: objectBytes.byteLength,
  gzipBytes: gzipSync(objectBytes, { level: 9 }).byteLength,
  brotliBytes: brotliCompressSync(objectBytes, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
  }).byteLength,
  sha256: createHash('sha256').update(objectBytes).digest('hex'),
};
await writeFile(
  `${outputPath}.json`,
  `${JSON.stringify(metadata, null, 2)}\n`
);
console.log(JSON.stringify(metadata, null, 2));
