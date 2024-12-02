#!/bin/sh

EXPORTS=(
  "_malloc" \
  "_free" \
  "_lua_absindex" \
  "_lua_arith" \
  "_lua_atpanic" \
  "_lua_callk" \
  "_lua_checkstack" \
  "_lua_close" \
  "_lua_closeslot" \
  "_lua_closethread" \
  "_lua_compare" \
  "_lua_concat"\
  "_lua_copy"\
  "_lua_createtable" \
  "_lua_dump" \
  "_lua_error" \
  "_lua_gc" \
  "_lua_getallocf" \
  "_lua_getfield" \
  "_lua_getglobal" \
  "_lua_geti" \
  "_lua_getmetatable" \
  "_lua_gettable" \
  "_lua_gettop" \
  "_lua_getiuservalue" \
  "_lua_iscfunction" \
  "_lua_isinteger" \
  "_lua_isnumber" \
  "_lua_isstring" \
  "_lua_isuserdata" \
  "_lua_isyieldable" \
  "_lua_len" \
  "_lua_load" \
  "_lua_newstate" \
  "_lua_newthread" \
  "_lua_newuserdatauv" \
  "_lua_next" \
  "_lua_pcallk" \
  "_lua_pushboolean" \
  "_lua_pushcclosure" \
  "_lua_pushfstring" \
  "_lua_pushinteger" \
  "_lua_pushlightuserdata" \
  "_lua_pushlstring" \
  "_lua_pushnil" \
  "_lua_pushnumber" \
  "_lua_pushstring" \
  "_lua_pushthread" \
  "_lua_pushvalue" \
  "_lua_pushvfstring" \
  "_lua_rawequal" \
  "_lua_rawget" \
  "_lua_rawgeti" \
  "_lua_rawgetp" \
  "_lua_rawlen" \
  "_lua_rawset" \
  "_lua_rawseti" \
  "_lua_rawsetp" \
  "_lua_resetthread" \
  "_lua_resume" \
  "_lua_rotate" \
  "_lua_setallocf" \
  "_lua_setfield" \
  "_lua_setglobal" \
  "_lua_seti" \
  "_lua_setiuservalue" \
  "_lua_setmetatable" \
  "_lua_settable" \
  "_lua_settop" \
  "_lua_setwarnf" \
  "_lua_status" \
  "_lua_stringtonumber" \
  "_lua_toboolean" \
  "_lua_tocfunction" \
  "_lua_toclose" \
  "_lua_tointegerx" \
  "_lua_tolstring" \
  "_lua_tonumberx" \
  "_lua_topointer" \
  "_lua_tothread" \
  "_lua_touserdata" \
  "_lua_type" \
  "_lua_typename" \
  "_lua_warning" \
  "_lua_xmove" \
  "_lua_yieldk" \
  "_luaL_addgsub" \
  "_luaL_addlstring" \
  "_luaL_addstring" \
  "_luaL_addvalue" \
  "_luaL_argerror" \
  "_luaL_buffinit" \
  "_luaL_callmeta" \
  "_luaL_checkany" \
  "_luaL_checkinteger" \
  "_luaL_checklstring" \
  "_luaL_checknumber" \
  "_luaL_checkoption" \
  "_luaL_checkstack" \
  "_luaL_checktype" \
  "_luaL_checkudata" \
  "_luaL_error" \
  "_luaL_execresult" \
  "_luaL_fileresult" \
  "_luaL_getmetafield" \
  "_luaL_getsubtable" \
  "_luaL_gsub" \
  "_luaL_len" \
  "_luaL_loadbufferx" \
  "_luaL_loadfilex" \
  "_luaL_loadstring" \
  "_luaL_newmetatable" \
  "_luaL_newstate" \
  "_luaL_openlibs" \
  "_luaL_optinteger" \
  "_luaL_optlstring" \
  "_luaL_optnumber" \
  "_luaL_prepbuffsize" \
  "_luaL_pushresult" \
  "_luaL_pushresultsize" \
  "_luaL_ref" \
  "_luaL_requiref" \
  "_luaL_setfuncs" \
  "_luaL_setmetatable" \
  "_luaL_testudata" \
  "_luaL_tolstring" \
  "_luaL_traceback" \
  "_luaL_typeerror" \
  "_luaL_unref"\
  "_luaL_where"\
)

exported_fns=""
for i in "${EXPORTS[@]}"; do
  exported_fns+="\"$i\"," 
done
exported_fns=${exported_fns%,*}

#echo '['${exported_fns}']' 

tsc -p ./user-glue

if [ $? -ne 0 ]; then
  echo "Failed to build user glue project. Make sure tsc is installed globally"
  return $? 
fi

emcc src/*.c -I./src -o lua-module.js -O0 -s WASM=1 -s MODULARIZE=1 -s EXPORT_ES6=1 -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORTED_FUNCTIONS='['${exported_fns}']' \
  --extern-pre-js=user-glue/extern-pre.js --post-js=user-glue/macro-defs.js

if [ $? -ne 0 ]; then
  return $?
fi

mv lua-module.js node-pkg/src
mv lua-module.wasm node-pkg/dist
cp user-glue/extern-pre.d.ts node-pkg/src/lua-module.d.ts
