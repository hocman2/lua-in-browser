Project at an early stage to run lua in browser client side. It exports the Lua C API to Javascript 
Only tested in browser for now but it should work in a Node environment as well

## Building
For now this library requires emsdk to be built: https://emscripten.org/index.html
This is because the Lua library can interact with the system broadly (printing, IO, etc.) and I didn't have time to write the WASM imports myself (See https://wasi.dev/).
Emscripten automatically implements WASI for both browser and Node environements, making it a convenient choice at that stage of the project.

- Run the `build.sh` script
- This will generate the `lua-module.wasm` file and the JS glue code. They will automatically be moved to the `node-pkg/` folder inside `src` and `dist`

Making the `lua-module.wasm` file fetchable can be tricky depending on your environment, for now there is no universal way to use the node package in an actual project.
I personnally had to use the `pnpm link` feature in my Vite/Svelte environment instead of the traditional monorepo approach.

## How to use
Check out the `node-pkg/src/lua-interface.ts` file.
It contains all of the functions that are used to create a Lua state and interact with it. There are a lot of comments explaining their usage.
The provided interface automatically handles memory allocation/deallocation to the WASM module and provides convenient functions to work with JS objects/functions and Lua tables/functions.

Note that it can be completely bypassed and you can use the `_raw()` function which gives you direct access to the WASM module's exported functions (mostly all Lua functions, prefixed by an underscore)
Using the raw WASM module requires you to manage memory yourself.

## Minimal working example
Need to rewrite
