#!/bin/sh

tsc

if [ $? -ne 0 ]; then
  echo "Failed to build. Make sure tsc is installed"
  return $?
fi

cp src/*.d.ts dist/
