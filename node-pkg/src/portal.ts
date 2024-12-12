import {luaPushGlobalValue, LuaStateHandle} from "./lua-interface.js";
import { LuaValue } from "./object-manipulation.js";
import { Ptr } from "./wasm-mem-interface.js";
import * as WMem from "./wasm-mem-interface.js";

type PObjectId = number;
type Portal = Map<PObjectId, LuaValue>;

let globalPidGen = 0;
const portals: Map<LuaStateHandle,Portal> = new Map();
let P: Portal = new Map();
let glNamePtr!: Ptr;

export function _initPortalModule() {
  glNamePtr = WMem.pushString("portal");
}

/**
* Opens and select a portal for the given Lua state
*
* Fails if there is already a portal open for this state
*/
export function portalOpen(L: LuaStateHandle) {
  if (portals.has(L))
    throw new Error("Cannot open more than one portal for a given Lua state");

  // Special case if the portal was used before being open
  // this is weird and we could handle it as an error but that would require P to be nullable
  // so we'll let this slip through, undocumented
  if (portals.size === 0) {
    luaPushGlobalValue(L, P, glNamePtr);
    portals.set(L, P);
  } else {
    const p = new Map();
    portals.set(L, p);
    luaPushGlobalValue(L, {}, glNamePtr);
    P = p;
  }
}

export function portalClose(L: LuaStateHandle) {
  const p = portals.get(L);
  if (p)
    cleanPortal(p);
  portals.delete(L);
}

export function portalSelect(L: LuaStateHandle) {
  const p = portals.get(L);
  if (!p)
    throw new Error("No portal for the given Lua state");

  P = p;
}

export function portalGet(id: PObjectId): LuaValue|undefined {
  return P.get(id);
}

export function portalSet(id: PObjectId|null, obj: LuaValue): PObjectId {
  if (!id)
    id = globalPidGen++;

  const curr = portalGet(id);
  if (curr) {
    //make & push diff
  } else {
    // lua_getglobal(L, "portal");
    // push obj directly
  }

  P.set(id, obj);

  return id;
}

function cleanPortal(p: Portal) {

}
