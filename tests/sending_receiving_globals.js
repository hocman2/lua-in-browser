import {lua, LuaType} from "lua-in-browser";
import assert from "node:assert";
import fs from "node:fs";
import util from "node:util";

function setAndGetGlobalPrimitive(L, val) {
  lua.load(L, "print(myG)", lua.KEEP_CODE_LOADED);
  lua.setGlobal(L, "myG", val);
  console.log("Expects: ", val);
  console.log("Value of global in lua state: ");
  lua.execute(L);
  return lua.getGlobal(L, "myG");
}

function assertGlobalPrimitive(type, val, expectedType, expectedVal) {
  assert(type === expectedType, `Value does not have the expected type. Received type: ${type}`);
  assert(val === expectedVal, `Value does not match the lua state content, received: ${val}`);
}

function setAndGetGlobal(L, dumpTableFile, val) {
  lua.load(L, dumpTableFile, lua.KEEP_CODE_LOADED);
  lua.setGlobal(L, "myG", val);
  console.log("Expects: ", util.inspect(val, {depth: null, colors: true}));
  console.log("Value of global in lua state: ");
  lua.execute(L);
  return lua.getGlobal(L, "myG");
}

function assertGlobal(type, val, expectedType, expectedVal) {
  assert(type === expectedType, `Value does not have the expected type. Received type: ${type}`);
  assert.deepStrictEqual(val, expectedVal, `Value does not match the lua state content. ${util.inspect(val, {depth: null, colors: true})}`);
}

function zizi(_L) {
  console.log("Hello from JSFunction !");
  return 0;
}

lua.onModuleReady(() => {
  const L = lua.createState();

  const file = fs.readFileSync("./printTable.lua");
  
  let [val, type] = setAndGetGlobalPrimitive(L, 3); 
  assertGlobalPrimitive(type, val, LuaType.TNUMBER, 3);

  [val, type] = setAndGetGlobalPrimitive(L, "Hello, world!");
  assertGlobalPrimitive(type, val, LuaType.TSTRING, "Hello, world!");

  [val, type] = setAndGetGlobalPrimitive(L, false);
  assertGlobalPrimitive(type, val, LuaType.TBOOLEAN, false);

  [val, type] = setAndGetGlobalPrimitive(L, zizi);
  assertGlobalPrimitive(type, val, LuaType.TFUNCTION, zizi);
  
  [val, type] = setAndGetGlobal(L, file, [2, zizi, "Hello, world", false]);
  assertGlobal(type, val, LuaType.TTABLE, [2, zizi, "Hello, world", false]);

  [val, type] = setAndGetGlobal(L, file, {"coucou": zizi, 34: 0, "2.54": false, "someKey": [1,2,3,"Adios"]});
  assertGlobal(type, val, LuaType.TTABLE, {"coucou": zizi, 34: 0, "2.54": false, "someKey": [1,2,3,"Adios"]});

  lua.freeState(L);
});
