import lua from "lua-in-browser";
import { LuaType } from "lua-in-browser"
import assert from "node:assert";
import fs from "node:fs";

const evtHandler = {
  events: [],
  on: function(fn) {
    evtHandler.events.push(fn);
  },
  triggerMyEvent: function() {
    while (evtHandler.events.length)
      evtHandler.events.pop()();
  }
}

// This is a function pushed to the lua state as a C Function
function myJSFunction(_L) {
  evtHandler.triggerMyEvent();
  return 0;
}

function receiveLuaFunction(L) {
  const args = lua.getJsFunctionArgs(L);
  assert(args.length === 1);
  assert(args[0][1] === LuaType.TFUNCTION);
  const ref = lua.createFnRef(L, args[0][0]);
  lua.callLuaFunction(L, ref);
  lua.freeFnRef(L, ref);
}

let calledCb1 = false;
let calledCb2 = false;
let calledCb3 = false;
evtHandler.on(() => (calledCb1 = true));
evtHandler.on(() => (calledCb2 = true));
evtHandler.on(() => (calledCb3 = true));

lua.onModuleReady(() => {
  /// Tests pushing JS functions to the lua state and invoking them from LUA
  const L = lua.createState();
  lua.setGlobal(L, "f", myJSFunction);
  lua.setGlobal(L, "giveFunction", receiveLuaFunction);
  const fileContent = fs.readFileSync("./callingFunctions.lua", "utf8");
  const code = lua.prepareCode(fileContent);
  lua.executeCode(L, code);

  assert(calledCb1, "Callback 1 not invoked");
  assert(calledCb2, "Callback 2 not invoked");
  assert(calledCb3, "Callback 3 not invoked");

  console.log("ALL GOOD");
});
