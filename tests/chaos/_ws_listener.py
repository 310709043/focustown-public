"""Minimal WS subscriber used by Phase 10 chaos drills.

Connects to ``ws://<host>:<port>/api/v1/ws/connect`` with a bearer token
in the WebSocket subprotocol, optionally subscribes to a single channel
(``room:{id}``), then prints one JSON line per inbound frame to stdout
with the format:

    {"received_at_ms": 173..., "type": "...", "raw": {...}}

The driving bash script tails this stdout to assert timing properties
(e.g. "tick frequency dropped to 0 momentarily then recovered within 5s").

Run inside the backend container so the ``websockets`` dependency is
guaranteed to be present (uvicorn[standard] pulls it in):

    docker compose exec -T backend python /app/scripts/_ws_listener.py \
        --token "$TOK" --channel "room:abc"

Exits when the connection closes OR after ``--duration`` seconds.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time

import websockets


async def listen(args: argparse.Namespace) -> int:
    uri = f"ws://{args.host}:{args.port}/api/v1/ws/connect"
    subprotocol = f"bearer.{args.token}"
    try:
        async with websockets.connect(
            uri,
            subprotocols=[subprotocol],
            open_timeout=5,
            close_timeout=5,
            ping_interval=20,
        ) as ws:
            if args.channel:
                await ws.send(json.dumps({"type": "subscribe", "channel": args.channel}))
            deadline = time.time() + args.duration if args.duration else None
            while True:
                try:
                    if deadline is not None:
                        remaining = deadline - time.time()
                        if remaining <= 0:
                            break
                        timeout = min(remaining, 5)
                    else:
                        timeout = None
                    raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
                except asyncio.TimeoutError:
                    if deadline is not None and time.time() >= deadline:
                        break
                    continue
                except websockets.ConnectionClosed:
                    break
                try:
                    payload = json.loads(raw)
                except json.JSONDecodeError:
                    payload = {"_raw": raw if isinstance(raw, str) else raw.decode("utf-8", "replace")}
                line = {
                    "received_at_ms": int(time.time() * 1000),
                    "type": payload.get("type") if isinstance(payload, dict) else None,
                    "raw": payload,
                }
                print(json.dumps(line, ensure_ascii=False), flush=True)
    except Exception as exc:  # noqa: BLE001 — drill must surface errors
        print(
            json.dumps(
                {
                    "received_at_ms": int(time.time() * 1000),
                    "type": "_listener_error",
                    "raw": {"error": str(exc)},
                }
            ),
            flush=True,
        )
        return 1
    return 0


def parse() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="localhost")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--token", required=True)
    p.add_argument("--channel", default=None, help="room:{id} or station:{...}")
    p.add_argument(
        "--duration",
        type=float,
        default=0,
        help="seconds to listen before exiting; 0 = until connection closes",
    )
    return p.parse_args()


if __name__ == "__main__":
    sys.exit(asyncio.run(listen(parse())))
