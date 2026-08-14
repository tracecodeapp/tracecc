#!/usr/bin/env node

import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { traceCCPchCompilerIdentity } from './pch-compiler-identity.mjs';

const compilerDirectory = resolve(process.argv[2]);
const runtimeHeaderPath = resolve(process.argv[3]);
const outputPath = resolve(process.argv[4]);
const bundlePath = resolve(compilerDirectory, 'bundle.js');
const runtimeHeader = await readFile(runtimeHeaderPath, 'utf8');
const compiler = await import(pathToFileURL(bundlePath).href);
const stderr = [];
const startedAt = performance.now();
const pchTemplateMode =
  process.env.TRACECODE_CPP_PCH_INSTANTIATE_TEMPLATES;
const pchTemplateArgs =
  pchTemplateMode === '1'
    ? ['-fpch-instantiate-templates']
    : pchTemplateMode === '0'
      ? ['-fno-pch-instantiate-templates']
      : [];
const pchCodegenArgs =
  process.env.TRACECODE_CPP_PCH_CODEGEN === '1' ? ['-fpch-codegen'] : [];
function vectorTypeAnchors(elementType) {
  return `
template class tracecode::Vector<${elementType}>;
template class tracecode::IndexedRangeReadIterator<tracecode::Vector<${elementType}>>;
template class tracecode::IndexedRangeReadable<tracecode::Vector<${elementType}>>;
template std::vector<${elementType}> tracecode::json_to<std::vector<${elementType}>>(
  const tracecode::JsonValue&);
template std::vector<${elementType}> tracecode::read_json_input<std::vector<${elementType}>>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template void tracecode::emit_snapshot_value<tracecode::Vector<${elementType}>>(
  const std::string&, const tracecode::Vector<${elementType}>&, int);
template std::string tracecode::to_json<${elementType}>(
  const std::vector<${elementType}>&);
template tracecode::IndexedRangeReadable<tracecode::Vector<${elementType}>>
tracecode::indexed_range_readable<${elementType}>(
  tracecode::Vector<${elementType}>&, int, const char*, const char*);
`;
}

const intVectorAnchors = `
template class tracecode::Vector<int>;
template class tracecode::IndexedRangeReadIterator<tracecode::Vector<int>>;
template class tracecode::IndexedRangeReadable<tracecode::Vector<int>>;
template std::vector<int> tracecode::json_to<std::vector<int>>(const tracecode::JsonValue&);
template std::vector<int> tracecode::read_json_input<std::vector<int>>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template void tracecode::emit_snapshot_value<tracecode::Vector<int>>(
  const std::string&, const tracecode::Vector<int>&, int);
template std::string tracecode::to_json<int>(const std::vector<int>&);
template tracecode::IndexedRangeReadable<tracecode::Vector<int>>
tracecode::indexed_range_readable<int>(
  tracecode::Vector<int>&, int, const char*, const char*);
`;
const corpusTypeAnchors = [
  intVectorAnchors,
  vectorTypeAnchors('std::vector<int>'),
  vectorTypeAnchors('std::string'),
  vectorTypeAnchors('char'),
  vectorTypeAnchors('std::vector<char>'),
  vectorTypeAnchors('std::vector<std::string>'),
  vectorTypeAnchors('double'),
  `
template int tracecode::read_json_input<int>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template long long tracecode::read_json_input<long long>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template bool tracecode::read_json_input<bool>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template double tracecode::read_json_input<double>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template char tracecode::read_json_input<char>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
template std::string tracecode::read_json_input<std::string>(
  const tracecode::JsonValue&, const std::string&, std::size_t);
`,
].join('\n');
const mapTypeAnchors = [
  corpusTypeAnchors,
  vectorTypeAnchors('std::variant<std::string, int>'),
  vectorTypeAnchors('std::vector<std::variant<std::string, int>>'),
  `
template class tracecode::UnorderedMap<std::string, std::string>;
template class tracecode::UnorderedMap<
  std::string, std::variant<std::string, int>>;
template class tracecode::Map<std::string, std::set<std::string>>;
template class tracecode::Map<std::string, std::variant<std::string, int>>;
template class tracecode::Set<std::string>;
template void tracecode::emit_snapshot_value<
  tracecode::UnorderedMap<std::string, std::string>>(
  const std::string&,
  const tracecode::UnorderedMap<std::string, std::string>&,
  int);
template void tracecode::emit_snapshot_value<
  tracecode::UnorderedMap<std::string, std::variant<std::string, int>>>(
  const std::string&,
  const tracecode::UnorderedMap<
    std::string, std::variant<std::string, int>>&,
  int);
template void tracecode::emit_snapshot_value<
  tracecode::Map<std::string, std::set<std::string>>>(
  const std::string&,
  const tracecode::Map<std::string, std::set<std::string>>&,
  int);
template void tracecode::emit_snapshot_value<tracecode::Set<std::string>>(
  const std::string&, const tracecode::Set<std::string>&, int);
`,
].join('\n');
const commonTypeAnchors =
  process.env.TRACECODE_CPP_PCH_MAP_TYPES === '1'
    ? mapTypeAnchors
    : process.env.TRACECODE_CPP_PCH_CORPUS_TYPES === '1'
      ? corpusTypeAnchors
    : process.env.TRACECODE_CPP_PCH_COMMON_TYPES === '1'
      ? intVectorAnchors
    : '';
const pchSource = `#include "tracecode_runtime.hpp"\n${commonTypeAnchors}`;

let files;
try {
  // Prefetch quietly before runClang's internal dry run so this TraceCC tool
  // does not stream the upstream wrapper's progress label to the console.
  await compiler.runLLVM(null, {}, { fetchProgress: () => {} });
  files = await compiler.runClang(
    [
      'clang++',
      '-std=c++23',
      '-O0',
      '-fno-exceptions',
      ...pchTemplateArgs,
      ...pchCodegenArgs,
      '-x',
      'c++-header',
      'tracecode_pch.hpp',
      '-o',
      'tracecode_pch.hpp.pch',
    ],
    {
      'tracecode_pch.hpp': pchSource,
      'tracecode_runtime.hpp': runtimeHeader,
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
      `TraceCC PCH generation exited unsuccessfully: ${String(error)}`,
      diagnostic.trim(),
    ].filter(Boolean).join('\n')
  );
}

const pchValue = files?.['tracecode_pch.hpp.pch'];
const pch = ArrayBuffer.isView(pchValue)
  ? new Uint8Array(pchValue.buffer, pchValue.byteOffset, pchValue.byteLength)
  : null;
if (!pch) {
  const diagnostic = new TextDecoder().decode(
    Buffer.concat(stderr.map((chunk) => Buffer.from(chunk)))
  );
  throw new Error(`TraceCC PCH generation failed:\n${diagnostic}`);
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, pch);
await writeFile(`${outputPath}.source.hpp`, pchSource, 'utf8');

const compilerIdentity = await traceCCPchCompilerIdentity(compilerDirectory);
const metadata = {
  compilerVersion: compiler.version,
  compilerSha256: compilerIdentity.files.find(
    (file) => file.path === 'llvm.core.wasm'
  ).sha256,
  compilerBundleSha256: compilerIdentity.bundleSha256,
  runtimeHeaderSha256: createHash('sha256').update(runtimeHeader).digest('hex'),
  pchSourceSha256: createHash('sha256').update(pchSource).digest('hex'),
  languageStandard: 'c++23',
  flags: ['-O0', '-fno-exceptions', ...pchTemplateArgs, ...pchCodegenArgs],
  instantiateTemplates:
    pchTemplateMode === '1'
      ? true
      : pchTemplateMode === '0'
        ? false
        : 'clang-default',
  commonTypeAnchors: process.env.TRACECODE_CPP_PCH_COMMON_TYPES === '1',
  corpusTypeAnchors: process.env.TRACECODE_CPP_PCH_CORPUS_TYPES === '1',
  mapTypeAnchors: process.env.TRACECODE_CPP_PCH_MAP_TYPES === '1',
  generationMs: Math.round((performance.now() - startedAt) * 10) / 10,
  bytes: pch.byteLength,
  gzipBytes: gzipSync(pch, { level: 9 }).byteLength,
  brotliBytes: brotliCompressSync(pch, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
  }).byteLength,
  sha256: createHash('sha256').update(pch).digest('hex'),
};
await writeFile(`${outputPath}.json`, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify(metadata, null, 2));
