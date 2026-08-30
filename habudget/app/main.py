"""Koll på Berget - backend.

Serves the frontend and keeps every connected browser in sync over a
WebSocket: the whole household-budget state is one JSON blob, exactly the
shape the original Claude Artifact used. Whenever a client sends a new
state, the server saves it to disk and rebroadcasts it to everyone
(including the sender), so every open tab always converges on the same
data - the same "every open view reloads to it" model the artifact had,
just running on your own machine instead.
"""
import asyncio
import json
import os
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

APP_DIR = Path(__file__).parent
DATA_DIR = Path(os.environ.get("HABUDGET_DATA_DIR", "/data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
STATE_FILE = DATA_DIR / "state.json"
SEED_FILE = APP_DIR / "seed-state.json"

EMPTY_STATE = {
    "people": [], "incomes": [], "fixedCosts": [], "fixedOverrides": [],
    "loans": [], "expenses": [], "goals": [], "trackingStart": "",
}


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    if SEED_FILE.exists():
        try:
            return json.loads(SEED_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return dict(EMPTY_STATE)


def save_state(data: dict) -> None:
    tmp = STATE_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    tmp.replace(STATE_FILE)


state = load_state()
if not STATE_FILE.exists():
    save_state(state)

clients: set[WebSocket] = set()
state_lock = asyncio.Lock()

app = FastAPI()


@app.get("/")
def index():
    return FileResponse(APP_DIR / "static" / "index.html")


app.mount("/static", StaticFiles(directory=APP_DIR / "static"), name="static")


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    global state
    await websocket.accept()
    clients.add(websocket)
    try:
        await websocket.send_text(json.dumps({"type": "state", "state": state}))
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except (ValueError, TypeError):
                continue
            if msg.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
                continue
            if msg.get("type") == "state" and isinstance(msg.get("state"), dict):
                async with state_lock:
                    state = msg["state"]
                    save_state(state)
                payload = json.dumps({"type": "state", "state": state})
                dead = []
                for client in list(clients):
                    try:
                        await client.send_text(payload)
                    except Exception:
                        dead.append(client)
                for client in dead:
                    clients.discard(client)
    except WebSocketDisconnect:
        pass
    finally:
        clients.discard(websocket)
