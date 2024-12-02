export type lua_State = number;
export declare const LUA_MULTRET = -1;
export declare enum StatusCode {
    OK = 0,
    ERRRUN = 2,
    ERRMEM = 4,
    ERRERR = 5,
    ERRSYNTAX = 3,
    YIELD = 1,
    ERRFILE = 6
}
export declare enum GcOpts {
    GCSTOP = 0,
    GCRESTART = 1,
    GCCOLLECT = 2,
    GCCOUNT = 3,
    GCCOUNTB = 4,
    GCSTEP = 5,
    GCSETPAUSE = 6,
    GCSETSTEPMUL = 7,
    GCISRUNNING = 8,
    GCGEN = 9,
    GCINC = 10
}
export declare enum Operators {
    OPADD = 0,
    OPSUB = 1,
    OPMUL = 2,
    OPMOD = 3,
    OPPOW = 4,
    OPDIV = 5,
    OPIDIV = 6,
    OPBAND = 7,
    OPBOR = 8,
    OPBXOR = 9,
    OPSHL = 10,
    OPSHR = 11,
    OPUNM = 12,
    OPBNOT = 13
}
export declare enum OperatorsComp {
    OPEQ = 0,
    OPLT = 1,
    OPLE = 2
}
