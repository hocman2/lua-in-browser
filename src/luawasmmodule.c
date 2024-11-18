#include "emscripten.h"
#include "lua.h"
#include "lualib.h"
#include "lauxlib.h"

void EMSCRIPTEN_KEEPALIVE sayHello() {
    lua_State* L = luaL_newstate();

    luaL_openlibs(L);

    if (luaL_loadfile(L, "resources/hello.lua") == LUA_OK) {
        lua_call(L, 0, 0);
    } else {
	printf("Error opening hello.lua");
    }

    lua_close(L);
}
