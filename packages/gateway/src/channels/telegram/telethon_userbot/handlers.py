"""
Command handlers for the Telethon userbot.

Processes JSON-over-stdio requests from the Node.js parent process:
- send_message: Send a message to a Telegram chat
- listen: Start/stop listening for incoming messages
- wait_reply: Wait for a reply from a specific user
- get_chats: Get the list of available chats
- health: Health check
- auth: Authentication commands

Each handler receives a parsed request dict and returns a response dict.
"""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from typing import Any, Callable, Coroutine, Optional, Tuple

logger = logging.getLogger("telethon_userbot.handlers")


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class MessageEvent:
    """An incoming message event from Telegram."""

    message_id: int
    chat_id: int
    sender_id: int
    sender_username: Optional[str]
    text: str
    timestamp: int  # Unix timestamp


# Type alias for async handler functions.
HandlerFunc = Callable[..., Coroutine[Any, Any, dict[str, Any]]]

# Type for reply waiter keys: (chat_id, user_id)
ReplyKey = Tuple[int, int]


# ---------------------------------------------------------------------------
# CommandHandler
# ---------------------------------------------------------------------------


class CommandHandler:
    """Processes incoming JSON-over-stdio commands from the Node.js parent.

    Dispatches each command to the appropriate handler method.
    """

    def __init__(
        self,
        client: Any,
        send_response: Callable[[dict[str, Any]], None],
    ) -> None:
        """Initialize CommandHandler.

        Args:
            client: Telethon TelegramClient instance.
            send_response: Callback to send JSON responses to Node.js parent.
        """
        self._client = client
        self._send_response = send_response
        self._listening = False
        self._message_handler: Any = None
        self._reply_waiters: dict[ReplyKey, asyncio.Future[MessageEvent]] = {}

    def _get_loop(self) -> asyncio.AbstractEventLoop:
        """Get the current running event loop."""
        try:
            return asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.get_event_loop()

    # -----------------------------------------------------------------------
    # Command dispatch
    # -----------------------------------------------------------------------

    async def handle(self, request: dict[str, Any]) -> dict[str, Any]:
        """Dispatch a request to the appropriate handler.

        Args:
            request: Parsed JSON request with 'type', 'id', 'params'.

        Returns:
            Response dict with 'type', 'id', 'data'.
        """
        request_type = request.get("type", "")
        request_id = request.get("id", "")
        params = request.get("params", {})

        handler_map: dict[str, HandlerFunc] = {
            "send_message": self._handle_send_message,
            "listen": self._handle_listen,
            "wait_reply": self._handle_wait_reply,
            "get_chats": self._handle_get_chats,
            "health": self._handle_health,
            "auth_code": self._handle_auth_code,
            "auth_2fa_password": self._handle_auth_2fa_password,
        }

        handler = handler_map.get(request_type)

        if handler is None:
            logger.warning("Unknown command type: %s", request_type)
            return self._error_response(request_id, f"Unknown command: {request_type}")

        try:
            return await handler(params, request_id)
        except Exception as exc:
            logger.error("Command handler failed: type=%s error=%s", request_type, exc)
            return self._error_response(request_id, str(exc))

    # -----------------------------------------------------------------------
    # Command handlers
    # -----------------------------------------------------------------------

    async def _handle_send_message(
        self, params: dict[str, Any], request_id: str
    ) -> dict[str, Any]:
        """Send a message to a Telegram chat.

        Expected params:
            chat_id: str/int -- Target chat ID
            text: str -- Message text
        """
        chat_id = params.get("chat_id")
        text = params.get("text", "")

        if not chat_id or not text:
            return self._error_response(request_id, "chat_id and text are required")

        try:
            entity = await self._client.get_entity(int(chat_id))
            result = await self._client.send_message(entity, text)

            return {
                "type": "send_result",
                "id": request_id,
                "data": {
                    "success": True,
                    "message_id": result.id if result else None,
                    "chat_id": str(chat_id),
                },
            }
        except Exception as exc:
            return self._error_response(request_id, f"Send failed: {exc}")

    async def _handle_listen(
        self, params: dict[str, Any], request_id: str
    ) -> dict[str, Any]:
        """Start or stop listening for incoming messages.

        Expected params:
            enabled: bool -- True to start, False to stop
        """
        enabled = params.get("enabled", True)

        if enabled and not self._listening:
            await self._start_listening()
            return {
                "type": "listen",
                "id": request_id,
                "data": {"success": True, "listening": True},
            }
        elif not enabled and self._listening:
            self._stop_listening()
            return {
                "type": "listen",
                "id": request_id,
                "data": {"success": True, "listening": False},
            }
        else:
            return {
                "type": "listen",
                "id": request_id,
                "data": {"success": True, "listening": self._listening},
            }

    async def _handle_wait_reply(
        self, params: dict[str, Any], request_id: str
    ) -> dict[str, Any]:
        """Wait for a reply from a specific user in a specific chat.

        Expected params:
            chat_id: str/int -- Chat to wait in
            user_id: int -- User to wait for reply from
            timeout: int -- Timeout in seconds (default: 60)
        """
        chat_id = params.get("chat_id")
        user_id = params.get("user_id")
        timeout = int(params.get("timeout", 60))

        if not chat_id or not user_id:
            return self._error_response(request_id, "chat_id and user_id are required")

        try:
            message_event = await self._wait_for_reply(
                int(chat_id), int(user_id), timeout
            )
            return {
                "type": "message",
                "id": request_id,
                "data": {
                    "message_id": message_event.message_id,
                    "chat_id": message_event.chat_id,
                    "sender_id": message_event.sender_id,
                    "sender_username": message_event.sender_username,
                    "text": message_event.text,
                    "timestamp": message_event.timestamp,
                },
            }
        except asyncio.TimeoutError:
            return self._error_response(request_id, "Timeout waiting for reply")
        except Exception as exc:
            return self._error_response(request_id, f"wait_reply failed: {exc}")

    async def _handle_get_chats(
        self, params: dict[str, Any], request_id: str
    ) -> dict[str, Any]:
        """Get the list of available chats (dialogs).

        Expected params:
            limit: int -- Max chats to return (default: 50)
        """
        limit = int(params.get("limit", 50))

        try:
            dialogs = await self._client.get_dialogs(limit=limit)
            chats = []
            for dialog in dialogs:
                entity = dialog.entity
                chats.append({
                    "id": entity.id,
                    "name": entity.title if hasattr(entity, "title") else str(entity.first_name or ""),
                    "type": self._entity_type(entity),
                    "unread_count": dialog.unread_count,
                })

            return {
                "type": "get_chats",
                "id": request_id,
                "data": {"chats": chats, "total": len(chats)},
            }
        except Exception as exc:
            return self._error_response(request_id, f"get_chats failed: {exc}")

    async def _handle_health(
        self, params: dict[str, Any], request_id: str
    ) -> dict[str, Any]:
        """Health check.

        Returns connection status and basic client info.
        """
        is_connected = self._client.is_connected() if self._client else False

        return {
            "type": "health",
            "id": request_id,
            "data": {
                "status": "ok" if is_connected else "disconnected",
                "connected": is_connected,
                "listening": self._listening,
                "pid": os.getpid(),
            },
        }

    async def _handle_auth_code(
        self, params: dict[str, Any], request_id: str
    ) -> dict[str, Any]:
        """Handle auth_code submission (delegated to AuthManager).

        This is a placeholder -- actual auth flow is coordinated by main.py.
        """
        code = params.get("code", "")
        if not code:
            return self._error_response(request_id, "code is required")
        return {
            "type": "auth_code_ack",
            "id": request_id,
            "data": {"received": True},
        }

    async def _handle_auth_2fa_password(
        self, params: dict[str, Any], request_id: str
    ) -> dict[str, Any]:
        """Handle auth_2fa_password submission (delegated to AuthManager).

        This is a placeholder -- actual auth flow is coordinated by main.py.
        """
        password = params.get("password", "")
        if not password:
            return self._error_response(request_id, "password is required")
        return {
            "type": "auth_2fa_ack",
            "id": request_id,
            "data": {"received": True},
        }

    # -----------------------------------------------------------------------
    # Message listening
    # -----------------------------------------------------------------------

    async def _start_listening(self) -> None:
        """Start listening for incoming Telegram messages."""
        from telethon import events

        @self._client.on(events.NewMessage(incoming=True))
        async def _on_new_message(event: Any) -> None:
            """Handle incoming message from Telegram."""
            sender = await event.get_sender()
            sender_username = None
            if sender and hasattr(sender, "username"):
                sender_username = sender.username

            msg = MessageEvent(
                message_id=event.id,
                chat_id=event.chat_id,
                sender_id=event.sender_id or 0,
                sender_username=sender_username,
                text=event.text or "",
                timestamp=int(event.date.timestamp()),
            )

            logger.debug(
                "Incoming message: message_id=%s chat_id=%s sender_id=%s",
                msg.message_id, msg.chat_id, msg.sender_id,
            )

            # Forward to Node.js parent
            self._send_response({
                "type": "message",
                "id": "incoming",
                "data": {
                    "message_id": msg.message_id,
                    "chat_id": msg.chat_id,
                    "sender_id": msg.sender_id,
                    "sender_username": msg.sender_username,
                    "text": msg.text,
                    "timestamp": msg.timestamp,
                },
            })

            # Check if anyone is waiting for a reply from this sender
            for key, future in list(self._reply_waiters.items()):
                if not future.done():
                    chat_id, user_id = key
                    if msg.chat_id == chat_id and msg.sender_id == user_id:
                        future.set_result(msg)

        self._message_handler = _on_new_message
        self._listening = True
        logger.info("Started listening for incoming messages")

    def _stop_listening(self) -> None:
        """Stop listening for incoming messages."""
        if self._message_handler and self._client:
            self._client.remove_event_handler(self._message_handler)
            self._message_handler = None
        self._listening = False
        logger.info("Stopped listening for incoming messages")

    # -----------------------------------------------------------------------
    # Reply waiting
    # -----------------------------------------------------------------------

    async def _wait_for_reply(
        self, chat_id: int, user_id: int, timeout: int
    ) -> MessageEvent:
        """Wait for a reply from a specific user in a specific chat.

        Args:
            chat_id: Chat ID to monitor.
            user_id: User ID to wait for.
            timeout: Timeout in seconds.

        Returns:
            MessageEvent from the matching user.

        Raises:
            asyncio.TimeoutError: If no reply within timeout.
        """
        key = (chat_id, user_id)
        loop = self._get_loop()
        future: asyncio.Future[MessageEvent] = loop.create_future()
        self._reply_waiters[key] = future

        try:
            return await asyncio.wait_for(future, timeout=timeout)
        finally:
            self._reply_waiters.pop(key, None)

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------

    def _error_response(self, request_id: str, message: str) -> dict[str, Any]:
        """Build an error response."""
        return {
            "type": "error",
            "id": request_id,
            "data": {"success": False, "message": message},
        }

    @staticmethod
    def _entity_type(entity: Any) -> str:
        """Determine the type of a Telegram entity."""
        from telethon.tl.types import (
            Channel,
            Chat,
            User,
        )

        if isinstance(entity, User):
            return "user"
        elif isinstance(entity, Chat):
            return "group"
        elif isinstance(entity, Channel):
            if getattr(entity, "megagroup", False):
                return "supergroup"
            return "channel"
        return "unknown"

    @property
    def is_listening(self) -> bool:
        """Check if the handler is currently listening for messages."""
        return self._listening
