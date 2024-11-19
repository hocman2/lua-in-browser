#include "emscripten.h"
#include "lua.h"
#include "lualib.h"
#include "lauxlib.h"

static lua_State* L = NULL;

void EMSCRIPTEN_KEEPALIVE createState() {
    L = luaL_newstate();
    luaL_openlibs(L);
}

int EMSCRIPTEN_KEEPALIVE executeLua(const char* lua) {
    if (L == NULL) {
	printf("Can't run lua before creating a state !\n");
	return 1;
    }

    if (luaL_dostring(L, lua) != LUA_OK) {
        const char* error = lua_tostring(L, -1);
	printf("Error executing lua: %s\n", error);
	lua_pop(L, 1);
	return 1;
    }
    
    return 0;
}

void EMSCRIPTEN_KEEPALIVE closeState() {
    lua_close(L);
    L = NULL;
}
