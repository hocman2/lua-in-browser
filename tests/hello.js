import {lua} from "lua-in-browser";

const events = [];

function onEvent(fn) {
  events.push(fn);
}

function triggerMyEvent() {
  while (events.length)
    events.pop()();
}

function myJSFunction(_L) {
  triggerMyEvent();   
  return 0;
}

onEvent(() => console.log("Gros pd de merde"));
onEvent(() => console.warn("sale prout"));
onEvent(() => console.warn("sale prout2"));

lua.onModuleReady(() => {
  const L = lua.createState();
  lua.setGlobal(L, "f", (L) => myJSFunction(L));
  lua.load(L, "f()", lua.KEEP_CODE_LOADED);
  lua.execute(L);
});

