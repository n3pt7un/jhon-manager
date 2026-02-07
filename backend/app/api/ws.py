import uuid

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = structlog.get_logger()

router = APIRouter(tags=["websocket"])


@router.websocket("/stream/{instance_id}")
async def instance_stream(
    websocket: WebSocket,
    instance_id: uuid.UUID,
) -> None:
    """WebSocket endpoint for streaming instance output.

    - Accepts the connection and registers with stream_manager.
    - Sends the replay buffer so late joiners see prior output.
    - Forwards incoming ping messages as pong responses.
    - Unregisters from stream_manager on disconnect.
    """
    await websocket.accept()

    stream_manager = websocket.app.state.stream_manager
    process_manager = websocket.app.state.process_manager

    await stream_manager.connect(instance_id, websocket)

    try:
        # Send replay buffer so the client can catch up
        buffer = process_manager.get_output_buffer(instance_id)
        if buffer:
            await websocket.send_json({"type": "replay", "data": buffer})

        # Main message loop
        while True:
            message = await websocket.receive_json()

            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info(
            "websocket_disconnected",
            instance_id=str(instance_id),
        )
    except Exception:
        logger.exception(
            "websocket_error",
            instance_id=str(instance_id),
        )
    finally:
        await stream_manager.disconnect(instance_id, websocket)
