import { parseTar } from 'nanotar';

function compileWasmModule(response) {
    if (WebAssembly.compileStreaming !== undefined) {
        // Node.js does not have 'WebAssembly.{compile,instantiate}Streaming'.
        return WebAssembly.compileStreaming(response);
    } else {
        return WebAssembly.compile(response.arrayBuffer());
    }
}

function unpackTarFilesystem(buffer) {
    const root = {};
    for (const tarEntry of parseTar(buffer)) {
        const nameParts = tarEntry.name.split('/');
        const dirNames = nameParts.slice(0, -1);
        const fileName = nameParts[nameParts.length - 1];
        let dir = root;
        for (const dirName of dirNames)
            dir = dir[dirName];
        if (tarEntry.type === 'directory') {
            dir[fileName] = {};
        } else {
            dir[fileName] = tarEntry.data;
        }
    }
    return root;
}

const modules = async (fetch) => ({
    "llvm.core.wasm": await fetch(new URL("./llvm.core.wasm", import.meta.url))
        .then(compileWasmModule),
    "llvm.core2.wasm": await fetch(new URL("./llvm.core2.wasm", import.meta.url))
        .then(compileWasmModule),
    "llvm.core3.wasm": await fetch(new URL("./llvm.core3.wasm", import.meta.url))
        .then(compileWasmModule),
    "llvm.core4.wasm": await fetch(new URL("./llvm.core4.wasm", import.meta.url))
        .then(compileWasmModule),
});

const filesystem = async (fetch) => ({
    "usr": await fetch(new URL("./llvm-resources.tar", import.meta.url))
        .then((resp) => resp.arrayBuffer())
        .then(unpackTarFilesystem)
});

const totalSize = 115059228;

export { modules, filesystem, totalSize };
