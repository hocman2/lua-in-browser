// Redefine some Lua constants

// We do this because whatever is in this file actually becomes lua-module.d.ts in the node-pkg
// ... yes it's a bit out of place
declare function Module(opts?: any): Promise<any>;
export default Module;

export type lua_State = number;
export const LUA_MULTRET = -1;
export enum StatusCode {
  OK = 0,
  ERRRUN = 2,
  ERRMEM = 4,
  ERRERR = 5,
  ERRSYNTAX = 3,
  YIELD = 1,
  ERRFILE = 6
}
export enum GcOpts {
  GCSTOP = 0,
  GCRESTART,
  GCCOLLECT,
  GCCOUNT,
  GCCOUNTB,
  GCSTEP,
  GCSETPAUSE,
  GCSETSTEPMUL,
  GCISRUNNING,
  GCGEN,
  GCINC
}
export enum Operators {
  OPADD = 0,
  OPSUB,
  OPMUL,
  OPMOD,
  OPPOW,
  OPDIV,
  OPIDIV,
  OPBAND,
  OPBOR,
  OPBXOR,
  OPSHL,
  OPSHR,
  OPUNM,
  OPBNOT,
}
export enum OperatorsComp {
  OPEQ = 0,
  OPLT,
  OPLE
}
