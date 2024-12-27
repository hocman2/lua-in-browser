import { lua_State } from "./lua-module";

export type Collection<T> = T[] | Set<T> | Map<string|number, T>;
export type Primitive = string | boolean | number | undefined | null;
export type JSFunction = (L: lua_State) => number;
type ObjectOfLuaValue = { [K: string]: LuaValue };
export type CollectionOfLuaValue = Collection<Primitive | ObjectOfLuaValue>;

/**
* A LuaValue is an aggregation of types that can be converted and pushed to a Lua state
*/
export type LuaValue =
  Primitive |
  JSFunction |
  ObjectOfLuaValue |
  CollectionOfLuaValue |
  Map<string|number, LuaValue> |
  LuaValue[] |
  Set<LuaValue>

/**
* A LuaObject is a specialization of LuaValue
*
* It's a javascript object or collection that contains LuaValues.
* This type is specifically used when we know we are working with objects
*/
export type LuaObject =
  ObjectOfLuaValue |
  CollectionOfLuaValue

/**
* It's time to purify this puny object 🔆⚔️
* @returns A deep copy of an object where fields that can't be sent to Lua state are ignored.
* Nested objects are also purified.
*
* View documentation of the PushableObject type for more information
*/
export function purifyObject(obj: object): LuaObject {
  let purified: LuaObject = {};

  if (isCollection(obj)) {
    // Turn any collection into a simple kvp object, this makes it easier to purify
    obj = formatLikeLuaCollection(obj as Collection<any>);
    purified = purifyObject(obj);
    return purified;
  }

  const keys = Object.keys(obj);
  keys.map(k => (obj as any)[k]).forEach((v: any, i) => {
    const k = keys[i];
    switch (typeof v) {
      case "string":
      case "number":
      case "boolean":
      case "undefined":
      // We'll trust typescript checking for functions, hoping nothing will break
      case "function":
        purified[k] = v;
        break;
      case "object":
        if (!v) {
          purified[k] = null;
          break;
        }

        purified[k] = purifyObject(v);
        break;
      default:
        break;
    }
  });

  return purified;
}

/**
*
* @returns true if is an array or a set
*/
export function isCollection(obj: any): boolean {
  return Array.isArray(obj) || obj instanceof Set;
}

/**
*
* @returns An object that is either the Map turned into a simple key-value object or
* an object where keys are successive integers starting from 1
*/
export function formatLikeLuaCollection(obj: CollectionOfLuaValue |
  Map<string|number, LuaValue> |
  LuaValue[] |
  Set<LuaValue>
): LuaObject {
  const o: any = {};

  if (Array.isArray(obj)) {
    obj.forEach((v, i) => {
      o[i + 1] = v;
    });
  } else if (obj instanceof Map) {
    obj.forEach((v, k) => {
      o[k] = v;
    });
  } else if (obj instanceof Set) {
    let count = 1;
    obj.forEach((v) => {
      o[count++] = v;
    });
  }

  return o;
}
