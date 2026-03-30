"""
Telethon Userbot Microservice -- JSON-over-stdio entry point.

This script runs as a child process of the Node.js osaI gateway.
Communication happens via line-delimited JSON over stdin/stdout.

Protocol:
    Node.js -> Python (stdin):  {"type":"<cmd>","id":"<id>","params":{...}}
    Python -> Node.js (stdout): {"type":"<result>","id":"<id>","data":{...}}

Commands:
    send_message -- Send message to a Telegram chat
    listen       -- Start/stop listening for incoming messages
    get_chats    -- Get list of available chats
    health       -- Health check
    auth         -- Authentication flow (phone + code + optional 2FA)

Environment variables:
    TELETHON_API_ID    -- Telegram API ID (from my.telegram.org)
    TELETHON_API_HASH  -- Telegram API Hash (from my.telegram.org)
    TELETHON_PHONE     -- Phone number for auth
    TELETHON_SESSION_DIR  -- Optional session directory override
    TELETHON_PASSPHRASE   -- Optional encryption passphrase

Signal handling:
    SIGTERM / SIGINT -- Graceful shutdown
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import sys
from typing import Any, Optional

logger = logging.getLogger("telethon_userbot")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PROTOCOL_VERSION = 1


# ---------------------------------------------------------------------------
# Response helper
# ---------------------------------------------------------------------------


def make_response(
    response_type: str,
    request_id: str,
    data: Any = None,
) -> str:
    """Build a JSON response line for the Node.js parent."""
    payload: dict[str, Any] = {
        "type": response_type,
        "id": request_id,
        "data": data if data is not None else {},
    }
    return json.dumps(payload, separators=(",", ":"))


def write_response(response_type: str, request_id: str, data: Any = None) -> None:
    """Write a JSON response line to stdout."""
    line = make_response(response_type, request_id, data)
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# Main Userbot class
# ---------------------------------------------------------------------------


class TelethonUserbot:
    """Main Telethon userbot class orchestrating the JSON-over-stdio loop."""

    def __init__(self) -> None:
        self._client: Any = None
        self._handlers: Any = None
        self._auth_manager: Any = None
        self._running = False
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._read_task: Optional[asyncio.Task[Any]] = None

        # Config from environment
        self._api_id = int(os.environ.get("TELETHON_API_ID", "0"))
        self._api_hash = os.environ.get("TELETHON_API_HASH", "")
        self._phone = os.environ.get("TELETHON_PHONE", "")
        self._session_dir = os.environ.get("TELETHON_SESSION_DIR")
        self._passphrase = os.environ.get("TELETHON_PASSPHRASE")

    # -----------------------------------------------------------------------
    # Lifecycle
    # -----------------------------------------------------------------------

    async def start(self) -> None:
        """Initialize and start the userbot.

        Creates the Telethon client, sets up signal handlers,
        and starts the stdin reader loop.
        """
        try:
            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            self._loop = asyncio.get_event_loop()

        self._running = True

        # Set up signal handlers
        self._setup_signals()

        # Import Telethon
        try:
            from telethon import TelegramClient
        except ImportError:
            write_response("error", "startup", {
                "success": False,
                "message": "telethon package not installed",
            })
            await self._shutdown()
            return

        # Create client
        session_path = self._get_session_path()
        self._client = TelegramClient(
            session=session_path,
            api_id=self._api_id,
            api_hash=self._api_hash,
        )

        # Create auth manager
        from auth import AuthManager, AuthConfig

        auth_config = AuthConfig(
            api_id=self._api_id,
            api_hash=self._api_hash,
            phone=self._phone,
            session_dir=self._session_dir,
            passphrase=self._passphrase,
        )
        self._auth_manager = AuthManager(
            config=auth_config,
            send_response=write_response,
        )
        self._auth_manager.set_client(self._client)

        # Create command handler
        from handlers import CommandHandler

        self._handlers = CommandHandler(
            client=self._client,
            send_response=write_response,
        )

        # Connect client
        try:
            await self._client.connect()
        except Exception as exc:
            write_response("error", "startup", {
                "success": False,
                "message": f"Failed to connect: {exc}",
            })
            await self._shutdown()
            return

        # Try auto-auth with existing session
        is_authorized = await self._client.is_user_authorized()
        if is_authorized:
            me = await self._client.get_me()
            write_response("auth_result", "startup", {
                "success": True,
                "user_id": me.id if me else None,
                "username": me.username if me else None,
                "first_name": me.first_name if me else None,
                "auto": True,
            })
            logger.info("Session restored, userbot ready")
        else:
            write_response("auth_result", "startup", {
                "success": False,
                "error": "Not authorized. Use 'auth' command to start auth flow.",
                "auto": False,
            })
            logger.info("No existing session, waiting for auth command")

        # Start stdin reader loop
        self._read_task = asyncio.create_task(self._read_stdin_loop())

        logger.info("Telethon userbot started, waiting for commands")

    async def _shutdown(self) -> None:
        """Gracefully shut down the userbot."""
        logger.info("Shutting down Telethon userbot")
        self._running = False

        # Stop listening
        if self._handlers:
            if self._handlers.is_listening:
                self._handlers._stop_listening()

        # Cancel stdin reader
        if self._read_task and not self._read_task.done():
            self._read_task.cancel()
            try:
                await self._read_task
            except asyncio.CancelledError:
                pass

        # Disconnect client
        if self._client:
            try:
                await self._client.disconnect()
            except Exception:
                pass

        logger.info("Telethon userbot shut down complete")

    # -----------------------------------------------------------------------
    # Stdin reading loop
    # -----------------------------------------------------------------------

    async def _read_stdin_loop(self) -> None:
        """Read lines from stdin and dispatch to command handler."""
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        await self._loop.connect_read_pipe(lambda: protocol, sys.stdin)

        while self._running:
            try:
                line_bytes = await reader.readline()
            except (asyncio.IncompleteReadError, ConnectionError):
                logger.info("Stdin closed, shutting down")
                break

            if not line_bytes:
                # EOF
                logger.info("Stdin EOF, shutting down")
                break

            line = line_bytes.decode("utf-8").strip()

            if not line:
                continue

            await self._process_line(line)

        await self._shutdown()

    async def _process_line(self, line: str) -> None:
        """Process a single JSON line from stdin."""
        stripped = line.strip()
        if not stripped:
            return

        try:
            request = json.loads(stripped)
            request = json.loads(line)
        except json.JSONDecodeError:
            write_response("error", "unknown", {
                "success": False,
                "message": "Invalid JSON",
            })
            return

        request_type = request.get("type", "")
        request_id = request.get("id", "unknown")
        params = request.get("params", {})

        logger.debug("Processing request: type=%s id=%s", request_type, request_id)

        # Handle auth command specially (coordinates with AuthManager)
        if request_type == "auth":
            await self._handle_auth(params, request_id)
            return

        # Delegate to CommandHandler for all other commands
        if self._handlers is None:
            write_response("error", request_id, {
                "success": False,
                "message": "Handlers not initialized",
            })
            return

        response = await self._handlers.handle(request)
        sys.stdout.write(json.dumps(response, separators=(",", ":")) + "\n")
        sys.stdout.flush()

    # -----------------------------------------------------------------------
    # Auth flow handling
    # -----------------------------------------------------------------------

    async def _handle_auth(self, params: dict[str, Any], request_id: str) -> None:
        """Handle auth command -- initiates or continues auth flow.

        States:
        - phone: Start auth with phone number
        - code: Submit verification code
        - 2fa: Submit 2FA password
        """
        action = params.get("action", "")

        if action == "phone":
            # Start auth flow
            try:
                from auth import AuthCodeRequired, Auth2FARequired

                result = await self._auth_manager.authenticate()
                write_response("auth_result", request_id, {
                    "success": result.success,
                    "user_id": result.user_id,
                    "username": result.username,
                    "first_name": result.first_name,
                    "error": result.error,
                })
            except AuthCodeRequired:
                # Code request was already sent to parent by AuthManager
                write_response("auth_result", request_id, {
                    "success": False,
                    "error": "code_required",
                    "message": "Verification code required",
                })
            except Auth2FARequired:
                write_response("auth_result", request_id, {
                    "success": False,
                    "error": "2fa_required",
                    "message": "Two-factor authentication required",
                })
            except Exception as exc:
                write_response("auth_result", request_id, {
                    "success": False,
                    "error": str(exc),
                })

        elif action == "code":
            code = params.get("code", "")
            if not code:
                write_response("error", request_id, {
                    "success": False,
                    "message": "code is required",
                })
                return

            try:
                from auth import Auth2FARequired

                result = await self._auth_manager.submit_code(code)
                write_response("auth_result", request_id, {
                    "success": result.success,
                    "user_id": result.user_id,
                    "username": result.username,
                    "first_name": result.first_name,
                })
            except Auth2FARequired:
                write_response("auth_result", request_id, {
                    "success": False,
                    "error": "2fa_required",
                    "message": "Two-factor authentication required",
                })
            except Exception as exc:
                write_response("auth_result", request_id, {
                    "success": False,
                    "error": str(exc),
                })

        elif action == "2fa":
            password = params.get("password", "")
            if not password:
                write_response("error", request_id, {
                    "success": False,
                    "message": "password is required",
                })
                return

            try:
                result = await self._auth_manager.submit_2fa_password(password)
                write_response("auth_result", request_id, {
                    "success": result.success,
                    "user_id": result.user_id,
                    "username": result.username,
                    "first_name": result.first_name,
                })
            except Exception as exc:
                write_response("auth_result", request_id, {
                    "success": False,
                    "error": str(exc),
                })

        else:
            write_response("error", request_id, {
                "success": False,
                "message": f"Unknown auth action: {action}",
            })

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------

    def _get_session_path(self) -> str:
        """Get the session file path for the Telethon client.

        Uses ~/.osai/channels/telegram/session/<phone> by default.
        """
        if self._session_dir:
            session_dir = self._session_dir
        else:
            home = os.path.expanduser("~")
            session_dir = os.path.join(
                home, ".osai", "channels", "telegram", "session"
            )

        os.makedirs(session_dir, exist_ok=True)

        sanitized = self._phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        return os.path.join(session_dir, sanitized)

    def _setup_signals(self) -> None:
        """Set up SIGTERM and SIGINT handlers for graceful shutdown."""
        if self._loop is None:
            return

        for sig in (signal.SIGTERM, signal.SIGINT):
            try:
                self._loop.add_signal_handler(
                    sig,
                    lambda s=sig: asyncio.create_task(self._on_signal(s)),
                )
            except NotImplementedError:
                # Windows does not support add_signal_handler
                signal.signal(sig, self._on_signal_sync)

    async def _on_signal(self, sig: signal.Signals) -> None:
        """Handle shutdown signals asynchronously."""
        logger.info("Received shutdown signal: %s", sig.name)
        await self._shutdown()

    def _on_signal_sync(self, sig: int, frame: Any) -> None:
        """Handle shutdown signals synchronously (Windows fallback)."""
        logger.info("Received shutdown signal: %s", sig)
        self._running = False


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def setup_logging() -> None:
    """Configure logging for the userbot process."""
    log_level = os.environ.get("TELETHON_LOG_LEVEL", "WARNING").upper()
    logging.basicConfig(
        level=getattr(logging, log_level, logging.WARNING),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stderr,  # Log to stderr to keep stdout for protocol
    )


async def async_main() -> None:
    """Async entry point."""
    setup_logging()

    if not os.environ.get("TELETHON_API_ID") or not os.environ.get("TELETHON_API_HASH"):
        write_response("error", "startup", {
            "success": False,
            "message": "TELETHON_API_ID and TELETHON_API_HASH environment variables are required",
        })
        sys.exit(1)

    userbot = TelethonUserbot()
    await userbot.start()


def main() -> None:
    """Synchronous entry point."""
    try:
        asyncio.run(async_main())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
