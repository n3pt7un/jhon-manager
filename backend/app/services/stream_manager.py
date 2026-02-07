from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import structlog
from fastapi import WebSocket

logger = structlog.get_logger(__name__)


class StreamManager:
    """Manages WebSocket connections and broadcasts output to connected clients."""

    def __init__(self) -> None:
        self._connections: dict[UUID, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, instance_id: UUID, websocket: WebSocket) -> None:
        """Register a WebSocket connection for an instance."""
        async with self._lock:
            if instance_id not in self._connections:
                self._connections[instance_id] = set()
            self._connections[instance_id].add(websocket)
        await logger.ainfo(
            "ws_connected",
            instance_id=str(instance_id),
            total=self.get_connection_count(instance_id),
        )

    async def disconnect(self, instance_id: UUID, websocket: WebSocket) -> None:
        """Remove a WebSocket connection."""
        async with self._lock:
            conns = self._connections.get(instance_id)
            if conns:
                conns.discard(websocket)
                if not conns:
                    del self._connections[instance_id]
        await logger.ainfo("ws_disconnected", instance_id=str(instance_id))

    async def broadcast(self, instance_id: UUID, message: dict[str, Any]) -> None:
        """Broadcast a message to all WebSocket clients watching an instance."""
        async with self._lock:
            conns = self._connections.get(instance_id, set()).copy()

        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)

        if dead:
            async with self._lock:
                conns_ref = self._connections.get(instance_id)
                if conns_ref:
                    for ws in dead:
                        conns_ref.discard(ws)

    async def broadcast_all(self, message: dict[str, Any]) -> None:
        """Broadcast a message to ALL connected WebSocket clients."""
        async with self._lock:
            all_conns: list[tuple[UUID, WebSocket]] = []
            for iid, conns in self._connections.items():
                for ws in conns.copy():
                    all_conns.append((iid, ws))

        dead: list[tuple[UUID, WebSocket]] = []
        for iid, ws in all_conns:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append((iid, ws))

        if dead:
            async with self._lock:
                for iid, ws in dead:
                    conns_ref = self._connections.get(iid)
                    if conns_ref:
                        conns_ref.discard(ws)

    def get_connection_count(self, instance_id: UUID) -> int:
        return len(self._connections.get(instance_id, set()))

    def get_total_connections(self) -> int:
        return sum(len(s) for s in self._connections.values())

    async def close(self) -> None:
        """Close all WebSocket connections."""
        async with self._lock:
            for conns in self._connections.values():
                for ws in conns:
                    try:
                        await ws.close()
                    except Exception:
                        pass
            self._connections.clear()
