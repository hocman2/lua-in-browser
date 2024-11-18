#!/bin/sh

emcc src/*.c -I./src -o lua.js -O0 -s WASM=1 -s EXPORT_ES6=1 -s ENVIRONMENT='web' --embed-file resources
