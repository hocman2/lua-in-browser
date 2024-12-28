import {lua} from "lua-in-browser";
import assert from "node:assert";

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

let calledCb1 = false;
let calledCb2 = false;
let calledCb3 = false;
evtHandler.on(() => (calledCb1 = true));
evtHandler.on(() => (calledCb2 = true));
evtHandler.on(() => (calledCb3 = true));

lua.onModuleReady(() => {
  const L = lua.createState();
  lua.setGlobal(L, "f", myJSFunction);
  lua.load(L, "f()");
  lua.execute(L);

  assert(calledCb1, "Callback 1 not invoked");
  assert(calledCb2, "Callback 2 not invoked");
  assert(calledCb3, "Callback 3 not invoked");
  console.log("ALL GOOD");
});

