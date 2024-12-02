// Redefine some Lua constants 
export const LUA_MULTRET = -1;
export var StatusCode;
(function (StatusCode) {
    StatusCode[StatusCode["OK"] = 0] = "OK";
    StatusCode[StatusCode["ERRRUN"] = 2] = "ERRRUN";
    StatusCode[StatusCode["ERRMEM"] = 4] = "ERRMEM";
    StatusCode[StatusCode["ERRERR"] = 5] = "ERRERR";
    StatusCode[StatusCode["ERRSYNTAX"] = 3] = "ERRSYNTAX";
    StatusCode[StatusCode["YIELD"] = 1] = "YIELD";
    StatusCode[StatusCode["ERRFILE"] = 6] = "ERRFILE";
})(StatusCode || (StatusCode = {}));
export var GcOpts;
(function (GcOpts) {
    GcOpts[GcOpts["GCSTOP"] = 0] = "GCSTOP";
    GcOpts[GcOpts["GCRESTART"] = 1] = "GCRESTART";
    GcOpts[GcOpts["GCCOLLECT"] = 2] = "GCCOLLECT";
    GcOpts[GcOpts["GCCOUNT"] = 3] = "GCCOUNT";
    GcOpts[GcOpts["GCCOUNTB"] = 4] = "GCCOUNTB";
    GcOpts[GcOpts["GCSTEP"] = 5] = "GCSTEP";
    GcOpts[GcOpts["GCSETPAUSE"] = 6] = "GCSETPAUSE";
    GcOpts[GcOpts["GCSETSTEPMUL"] = 7] = "GCSETSTEPMUL";
    GcOpts[GcOpts["GCISRUNNING"] = 8] = "GCISRUNNING";
    GcOpts[GcOpts["GCGEN"] = 9] = "GCGEN";
    GcOpts[GcOpts["GCINC"] = 10] = "GCINC";
})(GcOpts || (GcOpts = {}));
export var Operators;
(function (Operators) {
    Operators[Operators["OPADD"] = 0] = "OPADD";
    Operators[Operators["OPSUB"] = 1] = "OPSUB";
    Operators[Operators["OPMUL"] = 2] = "OPMUL";
    Operators[Operators["OPMOD"] = 3] = "OPMOD";
    Operators[Operators["OPPOW"] = 4] = "OPPOW";
    Operators[Operators["OPDIV"] = 5] = "OPDIV";
    Operators[Operators["OPIDIV"] = 6] = "OPIDIV";
    Operators[Operators["OPBAND"] = 7] = "OPBAND";
    Operators[Operators["OPBOR"] = 8] = "OPBOR";
    Operators[Operators["OPBXOR"] = 9] = "OPBXOR";
    Operators[Operators["OPSHL"] = 10] = "OPSHL";
    Operators[Operators["OPSHR"] = 11] = "OPSHR";
    Operators[Operators["OPUNM"] = 12] = "OPUNM";
    Operators[Operators["OPBNOT"] = 13] = "OPBNOT";
})(Operators || (Operators = {}));
export var OperatorsComp;
(function (OperatorsComp) {
    OperatorsComp[OperatorsComp["OPEQ"] = 0] = "OPEQ";
    OperatorsComp[OperatorsComp["OPLT"] = 1] = "OPLT";
    OperatorsComp[OperatorsComp["OPLE"] = 2] = "OPLE";
})(OperatorsComp || (OperatorsComp = {}));