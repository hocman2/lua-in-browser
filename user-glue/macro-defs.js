// Redefine lua macros as JS functions
Module["_lua_pcall"] = (L, nargs, nresults, errfunc) => Module._lua_pcallk(L, nargs, nresults, errfunc, 0, null);
Module["_lua_call"] = (L, nargs, nresults) => Module._lua_call(L, nargs, nresults, 0, null);
Module["_lua_yield"] = (L, nresults) => Module._lua_yieldk(L, nresults, 0, null);
Module["_lua_tostring"] = (L, i) => Module._lua_tolstring(L, i, null);
Module["_lua_pop"] = (L,n) => Module._lua_settop(L, -(n)-1);
