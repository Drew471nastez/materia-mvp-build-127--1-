#!/usr/bin/env python3
"""SENDS A WHOLE FILE AS ONE QUERY, AS THE SUPABASE SQL EDITOR DOES.

The editor hands the pasted text to Postgres in one simple-protocol Query
message (node-postgres with no parameters). Postgres then runs every
statement in it as one implicit transaction: the first error rolls back the
lot. psql -1 -f is close but not the same (psql splits the text itself,
interpolates :variables and reads backslash commands), so run.sh uses this
too. No client library is needed: the harness cluster trusts local
connections, so the wire protocol here is a startup message and one Query.

Usage: simple_query.py <socket dir> <port> <user> <database> <file>
Notices go to stderr, one per line; the exit code is 0 when the whole file
ran, 1 when Postgres answered with an error (printed with its position).
"""
import socket
import struct
import sys

sockdir, port, user, db, path = sys.argv[1:6]
sql = open(path, encoding="utf-8").read()


def recv_exact(s, n):
    buf = b""
    while len(buf) < n:
        chunk = s.recv(n - len(buf))
        if not chunk:
            raise SystemExit("connection closed")
        buf += chunk
    return buf


def messages(s):
    while True:
        kind = recv_exact(s, 1)
        (length,) = struct.unpack("!I", recv_exact(s, 4))
        yield kind, recv_exact(s, length - 4)


def fields(body):
    out = {}
    for part in body.split(b"\x00"):
        if part:
            out[chr(part[0])] = part[1:].decode("utf-8", "replace")
    return out


s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.connect(f"{sockdir}/.s.PGSQL.{port}")
params = b"user\x00" + user.encode() + b"\x00database\x00" + db.encode() + b"\x00application_name\x00sql-harness-editor\x00\x00"
s.sendall(struct.pack("!II", 8 + len(params), 196608) + params)
for kind, body in messages(s):
    if kind == b"E":
        f = fields(body)
        raise SystemExit(f"connect failed: {f.get('M')}")
    if kind == b"Z":
        break

payload = sql.encode("utf-8") + b"\x00"
s.sendall(b"Q" + struct.pack("!I", 4 + len(payload)) + payload)
error = None
statements = 0
for kind, body in messages(s):
    if kind == b"N":
        f = fields(body)
        print(f"{f.get('V', f.get('S'))}:  {f.get('M')}", file=sys.stderr)
    elif kind == b"E":
        error = fields(body)
    elif kind == b"C":
        statements += 1
    elif kind == b"Z":
        break
s.sendall(b"X\x00\x00\x00\x04")
s.close()

if error:
    pos = error.get("P")
    where = ""
    if pos:
        # P counts characters from 1 in the query text: turn it into a line.
        line = sql[: int(pos) - 1].count("\n") + 1
        where = f" (line {line} of {path})"
    else:
        # A runtime error has no position. Every statement in these files is
        # one line, so the statement after the last one that completed is
        # the line that failed.
        code = [i for i, l in enumerate(sql.split("\n"), 1) if l.strip() and not l.startswith("--") and not (l.startswith("/*") and l.rstrip().endswith("*/"))]
        if statements < len(code):
            where = f" (statement {statements + 1}, line {code[statements]} of {path})"
    print(f"ERROR:  {error.get('M')}{where}", file=sys.stderr)
    for key, label in (("D", "DETAIL"), ("H", "HINT"), ("W", "CONTEXT")):
        if error.get(key):
            print(f"{label}:  {error[key]}", file=sys.stderr)
    sys.exit(1)
print(f"{statements} statements ran")
