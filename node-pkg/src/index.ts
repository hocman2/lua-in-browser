import Module from "./lua-module.js"

let luaModule: any = null;

let currentPtr: number|undefined  = undefined;

function load(code: string) {
    if (currentPtr)
	luaModule._free(currentPtr);

    const encoder = new TextEncoder();
    const bytes = encoder.encode(code);
    currentPtr = luaModule._malloc(bytes.byteLength);
    const wasmMemory = new Uint8Array(luaModule.HEAP8.buffer, currentPtr, bytes.byteLength);
    wasmMemory.set(bytes);
}

function execute() {
    luaModule._executeLua(currentPtr);
}

export type Lua = {
    load: (code: string) => void,
    execute: () => void
}

export function createState(): Lua {
    if (!luaModule)
	throw new Error("WASM Module is not initialized yet !");

    luaModule._createState();

    return {
	load,
	execute
    }; 
}

Module()
.then((mod) => {
	luaModule = mod;
})
.catch((e) => console.log("Failed to load WASM module: ", e));
