#!/bin/bash
# serve.sh <dist> <port>: (re)starts the harness server for a build, pid in serve-<port>.pid
H=$(cd "$(dirname "$0")" && pwd); cd "$H"
[ -f serve-$2.pid ] && kill $(cat serve-$2.pid) 2>/dev/null
cp "public/probe-$(basename $1).css" public/probe.css 2>/dev/null
DIST=$1 nohup node node_modules/next/dist/bin/next start -p $2 > serve-$2.log 2>&1 &
echo $! > serve-$2.pid
until curl -s -o /dev/null localhost:$2/api/community/x/posts; do sleep 0.2; done
