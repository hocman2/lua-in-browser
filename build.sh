#!/bin/sh

emcc src/*.c -I./src -o lua-module.js -O0 -s WASM=1 -s EXPORT_ES6=1 -s ALLOW_MEMORY_GROWTH -s EXPORTED_FUNCTIONS='["_malloc", "_free"]' -s LINKABLE=1 -s EXPORT_ALL=1
