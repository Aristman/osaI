"""
Tests for the Telethon Userbot JSON-over-stdio protocol.

Covers:
- JSON protocol parsing and response formatting
- Auth flow (phone + code + 2FA)
- Command handling (send_message, listen, get_chats, health, wait_reply)
- Session encryption/decryption (AES-256-GCM)
- Signal handling (SIGTERM/SIGINT)
- Error handling (invalid JSON, unknown commands)
- Message event handling

All Telethon client interactions are mocked.
"""

from __future__ import annotations

import asyncio
import json
import os
import signal
import sys
from dataclasses import dataclass
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Ensure the telethon_userbot package is importable
# ---------------------------------------------------------------------------

# Add parent directory to path so imports work in test context
sys.path.insert(
    0,
    os.path.join(os.path.dirname(__file__), os.pardir),
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def captured_output():
    """Fixture to capture stdout writes."""
    lines: list[str] = []

    original_write = sys.stdout.write
    original_flush = sys.stdout.flush

    def capture_write(s: str) -> int:
        lines.append(s)
        return original_write(s)

    def capture_flush() -> None:
        original_flush()

    sys.stdout.write = capture_write  # type: ignore[assignment]
    sys.stdout.flush = capture_flush  # type: ignore[assignment]

    yield lines

    sys.stdout.write = original_write  # type: ignore[assignment]
    sys.stdout.flush = original_flush  # type: ignore[assignment]


@pytest.fixture
def mock_telethon_client():
    """Create a mock Telethon client."""
    client = AsyncMock()
    client.is_connected.return_value = True
    client.is_user_authorized.return_value = True
    client.connect = AsyncMock()
    client.disconnect = AsyncMock()
    client.send_message = AsyncMock()
    client.send_code_request = AsyncMock()
    client.sign_in = AsyncMock()
    client.get_entity = AsyncMock()
    client.get_dialogs = AsyncMock()
    client.get_me = AsyncMock()
    client.remove_event_handler = MagicMock()
    client.on = MagicMock(return_value=lambda f: f)

    return client


@pytest.fixture
def response_collector():
    """Fixture to collect responses sent via write_response callback."""
    responses: list[dict[str, Any]] = []

    def collect(response_type: str, request_id: str, data: Any = None) -> None:
        responses.append({
            "type": response_type,
            "id": request_id,
            "data": data,
        })

    return collect, responses


# ---------------------------------------------------------------------------
# Protocol tests
# ---------------------------------------------------------------------------


class TestJsonProtocol:
    """Tests for JSON-over-stdio protocol parsing and formatting."""

    def test_make_response_basic(self) -> None:
        """Test basic response creation."""
        from main import make_response

        result = make_response("health", "req-1", {"status": "ok"})

        parsed = json.loads(result)
        assert parsed["type"] == "health"
        assert parsed["id"] == "req-1"
        assert parsed["data"]["status"] == "ok"

    def test_make_response_minimal(self) -> None:
        """Test response with no data."""
        from main import make_response

        result = make_response("error", "req-2")

        parsed = json.loads(result)
        assert parsed["type"] == "error"
        assert parsed["id"] == "req-2"
        assert parsed["data"] == {}

    def test_make_response_is_single_line(self) -> None:
        """Test response is a single line (no newlines in JSON)."""
        from main import make_response

        result = make_response("send_result", "req-3", {"text": "hello\nworld"})
        lines = result.strip().split("\n")
        assert len(lines) == 1

    def test_make_response_with_unicode(self) -> None:
        """Test response handles Russian/Unicode text correctly."""
        from main import make_response

        result = make_response("message", "req-4", {"text": "Привет, мир!"})
        parsed = json.loads(result)
        assert parsed["data"]["text"] == "Привет, мир!"

    def test_invalid_json_input(self) -> None:
        """Test that invalid JSON returns an error response."""
        from main import TelethonUserbot

        userbot = TelethonUserbot()
        loop = asyncio.new_event_loop()

        captured: list[dict[str, Any]] = []

        original_write = sys.stdout.write

        def capture(s: str) -> int:
            for line in s.strip().split("\n"):
                if line:
                    try:
                        captured.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
            return 0

        sys.stdout.write = capture  # type: ignore[assignment]

        try:
            loop.run_until_complete(userbot._process_line("{invalid json"))
            assert any(r["type"] == "error" for r in captured)
        finally:
            sys.stdout.write = original_write  # type: ignore[assignment]
            loop.close()

    def test_valid_json_request_parsed(self) -> None:
        """Test that valid JSON request is correctly parsed."""
        from main import TelethonUserbot

        userbot = TelethonUserbot()

        request = json.dumps({
            "type": "health",
            "id": "test-1",
            "params": {},
        })

        # Should not raise an exception during parsing
        # The handlers are None, so we expect an error about that
        loop = asyncio.new_event_loop()

        captured: list[dict[str, Any]] = []

        original_write = sys.stdout.write

        def capture(s: str) -> int:
            for line in s.strip().split("\n"):
                if line:
                    try:
                        captured.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
            return 0

        sys.stdout.write = capture  # type: ignore[assignment]

        try:
            loop.run_until_complete(userbot._process_line(request))
            # Should get an error about handlers not being initialized
            assert len(captured) > 0
        finally:
            sys.stdout.write = original_write  # type: ignore[assignment]
            loop.close()

    def test_empty_line_ignored(self) -> None:
        """Test that empty lines are silently ignored."""
        from main import TelethonUserbot

        userbot = TelethonUserbot()
        loop = asyncio.new_event_loop()

        captured: list[str] = []

        original_write = sys.stdout.write

        def capture(s: str) -> int:
            captured.append(s)
            return 0

        sys.stdout.write = capture  # type: ignore[assignment]

        try:
            loop.run_until_complete(userbot._process_line(""))
            # Empty lines should produce no JSON output
            json_lines = [s for s in captured if s.strip()]
            assert len(json_lines) == 0
        finally:
            sys.stdout.write = original_write  # type: ignore[assignment]
            loop.close()


# ---------------------------------------------------------------------------
# Command handler tests
# ---------------------------------------------------------------------------


class TestCommandHandlers:
    """Tests for command handler dispatch and individual handlers."""

    @pytest.mark.asyncio
    async def test_health_check_returns_ok(self, mock_telethon_client) -> None:
        """Test health command returns connected status."""
        from handlers import CommandHandler

        # is_connected is a regular method, not a coroutine
        mock_telethon_client.is_connected = MagicMock(return_value=True)

        responses: list[dict[str, Any]] = []
        handler = CommandHandler(
            client=mock_telethon_client,
            send_response=lambda r: responses.append(r),
        )

        result = await handler.handle({
            "type": "health",
            "id": "health-1",
            "params": {},
        })

        assert result["type"] == "health"
        assert result["data"]["status"] == "ok"
        assert result["data"]["connected"] is True
        assert result["id"] == "health-1"

    @pytest.mark.asyncio
    async def test_health_check_disconnected(self) -> None:
        """Test health command when client is disconnected."""
        from handlers import CommandHandler

        client = AsyncMock()
        client.is_connected = MagicMock(return_value=False)

        handler = CommandHandler(
            client=client,
            send_response=lambda r: None,
        )

        result = await handler.handle({
            "type": "health",
            "id": "health-2",
            "params": {},
        })

        assert result["data"]["status"] == "disconnected"
        assert result["data"]["connected"] is False

    @pytest.mark.asyncio
    async def test_unknown_command_returns_error(self, mock_telethon_client) -> None:
        """Test unknown command type returns error response."""
        from handlers import CommandHandler

        handler = CommandHandler(
            client=mock_telethon_client,
            send_response=lambda r: None,
        )

        result = await handler.handle({
            "type": "unknown_command",
            "id": "req-unknown",
            "params": {},
        })

        assert result["type"] == "error"
        assert "Unknown command" in result["data"]["message"]

    @pytest.mark.asyncio
    async def test_send_message_success(self, mock_telethon_client) -> None:
        """Test successful send_message command."""
        from handlers import CommandHandler

        sent_message = MagicMock()
        sent_message.id = 12345
        mock_telethon_client.send_message.return_value = sent_message

        mock_entity = MagicMock()
        mock_telethon_client.get_entity.return_value = mock_entity

        handler = CommandHandler(
            client=mock_telethon_client,
            send_response=lambda r: None,
        )

        result = await handler.handle({
            "type": "send_message",
            "id": "send-1",
            "params": {"chat_id": "123456", "text": "Hello!"},
        })

        assert result["type"] == "send_result"
        assert result["data"]["success"] is True
        assert result["data"]["message_id"] == 12345
        assert result["data"]["chat_id"] == "123456"

    @pytest.mark.asyncio
    async def test_send_message_missing_params(self, mock_telethon_client) -> None:
        """Test send_message with missing required params returns error."""
        from handlers import CommandHandler

        handler = CommandHandler(
            client=mock_telethon_client,
            send_response=lambda r: None,
        )

        result = await handler.handle({
            "type": "send_message",
            "id": "send-err",
            "params": {},
        })

        assert result["type"] == "error"
        assert "chat_id" in result["data"]["message"]

    @pytest.mark.asyncio
    async def test_send_message_failure(self, mock_telethon_client) -> None:
        """Test send_message when client raises an error."""
        from handlers import CommandHandler

        mock_telethon_client.get_entity.side_effect = Exception("Chat not found")

        handler = CommandHandler(
            client=mock_telethon_client,
            send_response=lambda r: None,
        )

        result = await handler.handle({
            "type": "send_message",
            "id": "send-fail",
            "params": {"chat_id": "999", "text": "Hi"},
        })

        assert result["type"] == "error"
        assert "Send failed" in result["data"]["message"]

    @pytest.mark.asyncio
    async def test_get_chats_success(self, mock_telethon_client) -> None:
        """Test get_chats command returns chat list."""
        from handlers import CommandHandler

        # Create mock dialogs
        mock_dialog_1 = MagicMock()
        mock_entity_1 = MagicMock()
        mock_entity_1.id = 111
        mock_entity_1.title = "Test Group"
        mock_entity_1.megagroup = True
        mock_entity_1.__class__.__name__ = "Channel"
        mock_dialog_1.entity = mock_entity_1
        mock_dialog_1.unread_count = 5

        mock_dialog_2 = MagicMock()
        mock_entity_2 = MagicMock()
        mock_entity_2.id = 222
        mock_entity_2.first_name = "John"
        mock_entity_2.username = "john"
        mock_entity_2.title = None
        mock_entity_2.__class__.__name__ = "User"
        mock_dialog_2.entity = mock_entity_2
        mock_dialog_2.unread_count = 0

        mock_telethon_client.get_dialogs.return_value = [mock_dialog_1, mock_dialog_2]

        handler = CommandHandler(
            client=mock_telethon_client,
            send_response=lambda r: None,
        )

        result = await handler.handle({
            "type": "get_chats",
            "id": "chats-1",
            "params": {},
        })

        assert result["type"] == "get_chats"
        assert result["data"]["total"] == 2
        assert len(result["data"]["chats"]) == 2
        assert result["data"]["chats"][0]["id"] == 111
        assert result["data"]["chats"][0]["name"] == "Test Group"
        assert result["data"]["chats"][1]["id"] == 222

    @pytest.mark.asyncio
    async def test_get_chats_failure(self, mock_telethon_client) -> None:
        """Test get_chats when client raises an error."""
        from handlers import CommandHandler

        mock_telethon_client.get_dialogs.side_effect = Exception("Not connected")

        handler = CommandHandler(
            client=mock_telethon_client,
            send_response=lambda r: None,
        )

        result = await handler.handle({
            "type": "get_chats",
            "id": "chats-err",
            "params": {},
        })

        assert result["type"] == "error"
        assert "get_chats failed" in result["data"]["message"]

    @pytest.mark.asyncio
    async def test_listen_start(self, mock_telethon_client) -> None:
        """Test listen command starts listening."""
        from handlers import CommandHandler

        handler = CommandHandler(
            client=mock_telethon_client,
            send_response=lambda r: None,
        )

        result = await handler.handle({
            "type": "listen",
            "id": "listen-1",
            "params": {"enabled": True},
        })

        assert result["type"] == "listen"
        assert result["data"]["listening"] is True
        assert result["data"]["success"] is True
        assert handler.is_listening is True

    @pytest.mark.asyncio
    async def test_listen_stop(self, mock_telethon_client) -> None:
        """Test listen command stops listening."""
        from handlers import CommandHandler

        handler = CommandHandler(
            client=mock_telethon_client,
            send_response=lambda r: None,
        )

        # Start first
        await handler.handle({
            "type": "listen",
            "id": "listen-start",
            "params": {"enabled": True},
        })

        # Stop
        result = await handler.handle({
            "type": "listen",
            "id": "listen-stop",
            "params": {"enabled": False},
        })

        assert result["data"]["listening"] is False
        assert handler.is_listening is False

    @pytest.mark.asyncio
    async def test_listen_idempotent_start(self, mock_telethon_client) -> None:
        """Test that starting listen twice returns current state."""
        from handlers import CommandHandler

        handler = CommandHandler(
            client=mock_telethon_client,
            send_response=lambda r: None,
        )

        await handler.handle({
            "type": "listen",
            "id": "l1",
            "params": {"enabled": True},
        })

        result = await handler.handle({
            "type": "listen",
            "id": "l2",
            "params": {"enabled": True},
        })

        assert result["data"]["listening"] is True

    @pytest.mark.asyncio
    async def test_wait_reply_timeout(self, mock_telethon_client) -> None:
        """Test wait_reply returns error on timeout."""
        from handlers import CommandHandler

        handler = CommandHandler(
            client=mock_telethon_client,
            send_response=lambda r: None,
        )

        result = await handler.handle({
            "type": "wait_reply",
            "id": "wait-1",
            "params": {
                "chat_id": "123",
                "user_id": 456,
                "timeout": 1,
            },
        })

        assert result["type"] == "error"
        assert "Timeout" in result["data"]["message"]

    @pytest.mark.asyncio
    async def test_wait_reply_missing_params(self, mock_telethon_client) -> None:
        """Test wait_reply with missing params returns error."""
        from handlers import CommandHandler

        handler = CommandHandler(
            client=mock_telethon_client,
            send_response=lambda r: None,
        )

        result = await handler.handle({
            "type": "wait_reply",
            "id": "wait-err",
            "params": {},
        })

        assert result["type"] == "error"
        assert "chat_id" in result["data"]["message"]

    @pytest.mark.asyncio
    async def test_auth_code_handler(self, mock_telethon_client) -> None:
        """Test auth_code handler acknowledges receipt."""
        from handlers import CommandHandler

        handler = CommandHandler(
            client=mock_telethon_client,
            send_response=lambda r: None,
        )

        result = await handler.handle({
            "type": "auth_code",
            "id": "auth-1",
            "params": {"code": "12345"},
        })

        assert result["type"] == "auth_code_ack"
        assert result["data"]["received"] is True

    @pytest.mark.asyncio
    async def test_auth_code_handler_missing_code(self, mock_telethon_client) -> None:
        """Test auth_code handler with missing code returns error."""
        from handlers import CommandHandler

        handler = CommandHandler(
            client=mock_telethon_client,
            send_response=lambda r: None,
        )

        result = await handler.handle({
            "type": "auth_code",
            "id": "auth-err",
            "params": {},
        })

        assert result["type"] == "error"
        assert "code" in result["data"]["message"]

    @pytest.mark.asyncio
    async def test_auth_2fa_handler(self, mock_telethon_client) -> None:
        """Test auth_2fa_password handler acknowledges receipt."""
        from handlers import CommandHandler

        handler = CommandHandler(
            client=mock_telethon_client,
            send_response=lambda r: None,
        )

        result = await handler.handle({
            "type": "auth_2fa_password",
            "id": "auth-2fa",
            "params": {"password": "secret"},
        })

        assert result["type"] == "auth_2fa_ack"
        assert result["data"]["received"] is True

    @pytest.mark.asyncio
    async def test_handler_exception_returns_error(self, mock_telethon_client) -> None:
        """Test that handler exceptions produce error responses."""
        from handlers import CommandHandler

        handler = CommandHandler(
            client=mock_telethon_client,
            send_response=lambda r: None,
        )

        # Trigger an exception in send_message by passing non-integer chat_id
        # that will fail when int() is called on it
        result = await handler.handle({
            "type": "send_message",
            "id": "exc-1",
            "params": {"chat_id": 12345, "text": "test"},
        })

        # Should either succeed or return error -- not crash
        assert result["type"] in ("send_result", "error")


# ---------------------------------------------------------------------------
# Session encryption tests
# ---------------------------------------------------------------------------


class TestSessionEncryption:
    """Tests for AES-256-GCM session encryption and storage."""

    def test_encrypt_decrypt_roundtrip(self) -> None:
        """Test that encrypted data can be decrypted back."""
        from session import SessionCrypto

        crypto = SessionCrypto("test-passphrase")
        plaintext = b"secret-session-data-12345"

        encrypted = crypto.encrypt(plaintext)
        decrypted = crypto.decrypt(encrypted)

        assert decrypted == plaintext

    def test_encrypt_produces_different_ciphertexts(self) -> None:
        """Test that two encryptions produce different ciphertexts (random nonce)."""
        from session import SessionCrypto

        crypto = SessionCrypto("test-passphrase")
        plaintext = b"same-data"

        enc1 = crypto.encrypt(plaintext)
        enc2 = crypto.encrypt(plaintext)

        assert enc1.ciphertext != enc2.ciphertext
        assert enc1.nonce != enc2.nonce
        assert enc1.salt != enc2.salt

    def test_wrong_passphrase_fails(self) -> None:
        """Test that decryption with wrong passphrase fails."""
        from session import SessionCrypto

        crypto1 = SessionCrypto("correct-passphrase")
        crypto2 = SessionCrypto("wrong-passphrase")

        encrypted = crypto1.encrypt(b"secret")

        with pytest.raises(Exception):
            crypto2.decrypt(encrypted)

    def test_empty_passphrase_raises(self) -> None:
        """Test that empty passphrase raises ValueError."""
        from session import SessionCrypto

        with pytest.raises(ValueError, match="Passphrase must not be empty"):
            SessionCrypto("")

    def test_session_store_save_and_load(self, tmp_path) -> None:
        """Test saving and loading session from disk."""
        from session import SessionStore

        store = SessionStore(session_dir=str(tmp_path), passphrase="test-key")
        data = b"telethon-session-data"

        path = store.save("+79991234567", data)
        assert path.exists()

        loaded = store.load("+79991234567")
        assert loaded == data

    def test_session_store_nonexistent_returns_none(self, tmp_path) -> None:
        """Test loading nonexistent session returns None."""
        from session import SessionStore

        store = SessionStore(session_dir=str(tmp_path), passphrase="test-key")

        result = store.load("+79990000000")
        assert result is None

    def test_session_store_exists_check(self, tmp_path) -> None:
        """Test session exists check."""
        from session import SessionStore

        store = SessionStore(session_dir=str(tmp_path), passphrase="test-key")

        assert not store.exists("+79991111111")
        store.save("+79991111111", b"data")
        assert store.exists("+79991111111")

    def test_session_store_delete(self, tmp_path) -> None:
        """Test session deletion."""
        from session import SessionStore

        store = SessionStore(session_dir=str(tmp_path), passphrase="test-key")
        store.save("+79992222222", b"data")

        assert store.exists("+79992222222")
        assert store.delete("+79992222222") is True
        assert not store.exists("+79992222222")

    def test_session_store_delete_nonexistent(self, tmp_path) -> None:
        """Test deleting nonexistent session returns False."""
        from session import SessionStore

        store = SessionStore(session_dir=str(tmp_path), passphrase="test-key")
        assert store.delete("+79993333333") is False

    def test_session_store_creates_directory(self, tmp_path) -> None:
        """Test that session store creates directory if missing."""
        from session import SessionStore

        nested_dir = str(tmp_path / "nested" / "dir")
        store = SessionStore(session_dir=nested_dir, passphrase="test-key")

        store.save("+79994444444", b"data")
        assert os.path.isdir(nested_dir)

    def test_session_store_phone_sanitization(self, tmp_path) -> None:
        """Test that phone numbers are sanitized for filenames."""
        from session import SessionStore

        store = SessionStore(session_dir=str(tmp_path), passphrase="test-key")
        store.save("+7 (999) 555-44-33", b"data")

        # Check that a file exists with sanitized name
        files = os.listdir(str(tmp_path))
        assert any("79995554433" in f for f in files)

    def test_session_file_is_json(self, tmp_path) -> None:
        """Test that session file is valid JSON with expected structure."""
        from session import SessionStore

        store = SessionStore(session_dir=str(tmp_path), passphrase="test-key")
        store.save("+79996666666", b"session-data")

        # Find the session file
        files = os.listdir(str(tmp_path))
        session_files = [f for f in files if f.endswith(".enc")]
        assert len(session_files) == 1

        with open(os.path.join(str(tmp_path), session_files[0]), "r", encoding="utf-8") as f:
            content = json.load(f)

        assert content["version"] == 1
        assert "salt" in content
        assert "nonce" in content
        assert "ciphertext" in content


# ---------------------------------------------------------------------------
# Auth tests
# ---------------------------------------------------------------------------


class TestAuthFlow:
    """Tests for the authentication flow."""

    def test_auth_config_creation(self) -> None:
        """Test AuthConfig dataclass creation."""
        from auth import AuthConfig

        config = AuthConfig(
            api_id=12345,
            api_hash="abc123",
            phone="+79991234567",
        )

        assert config.api_id == 12345
        assert config.api_hash == "abc123"
        assert config.phone == "+79991234567"

    def test_auth_result_success(self) -> None:
        """Test AuthResult for successful auth."""
        from auth import AuthResult

        result = AuthResult(
            success=True,
            user_id=12345,
            username="testuser",
            first_name="Test",
        )

        assert result.success is True
        assert result.user_id == 12345
        assert result.username == "testuser"
        assert result.error is None

    def test_auth_result_failure(self) -> None:
        """Test AuthResult for failed auth."""
        from auth import AuthResult

        result = AuthResult(
            success=False,
            error="Invalid code",
        )

        assert result.success is False
        assert result.error == "Invalid code"
        assert result.user_id is None

    def test_auth_error_types(self) -> None:
        """Test auth error hierarchy."""
        from auth import AuthError, AuthCodeRequired, Auth2FARequired, AuthInvalidCode

        assert issubclass(AuthCodeRequired, AuthError)
        assert issubclass(Auth2FARequired, AuthError)
        assert issubclass(AuthInvalidCode, AuthError)

        with pytest.raises(AuthCodeRequired):
            raise AuthCodeRequired("+79991234567")

        with pytest.raises(Auth2FARequired):
            raise Auth2FARequired()

        with pytest.raises(AuthInvalidCode):
            raise AuthInvalidCode()

    def test_auth_manager_creation(self) -> None:
        """Test AuthManager creation."""
        from auth import AuthManager, AuthConfig

        config = AuthConfig(
            api_id=12345,
            api_hash="abc",
            phone="+79991234567",
        )

        responses: list[dict[str, Any]] = []
        manager = AuthManager(
            config=config,
            send_response=lambda r: responses.append(r),
        )

        assert manager.result is None
        assert manager.is_authenticated is False

    @pytest.mark.asyncio
    async def test_authenticate_requires_client(self) -> None:
        """Test that authenticate raises if client is not set."""
        from auth import AuthManager, AuthConfig, AuthError

        config = AuthConfig(
            api_id=12345,
            api_hash="abc",
            phone="+79991234567",
        )

        manager = AuthManager(
            config=config,
            send_response=lambda r: None,
        )

        with pytest.raises(AuthError, match="Telethon client not set"):
            await manager.authenticate()

    @pytest.mark.asyncio
    async def test_authenticate_already_authorized(self) -> None:
        """Test auth with existing valid session."""
        from auth import AuthManager, AuthConfig
        from telethon import TelegramClient

        config = AuthConfig(
            api_id=12345,
            api_hash="abc",
            phone="+79991234567",
        )

        mock_client = AsyncMock(spec=TelegramClient)
        mock_client.connect = AsyncMock()
        mock_client.is_user_authorized = AsyncMock(return_value=True)

        mock_me = MagicMock()
        mock_me.id = 12345
        mock_me.username = "testuser"
        mock_me.first_name = "Test"
        mock_client.get_me = AsyncMock(return_value=mock_me)

        responses: list[dict[str, Any]] = []
        manager = AuthManager(
            config=config,
            send_response=lambda r: responses.append(r),
        )
        manager.set_client(mock_client)

        result = await manager.authenticate()

        assert result.success is True
        assert result.user_id == 12345
        assert result.username == "testuser"
        assert manager.is_authenticated is True


# ---------------------------------------------------------------------------
# Message event tests
# ---------------------------------------------------------------------------


class TestMessageEvent:
    """Tests for MessageEvent dataclass."""

    def test_message_event_creation(self) -> None:
        """Test MessageEvent creation with all fields."""
        from handlers import MessageEvent

        event = MessageEvent(
            message_id=100,
            chat_id=200,
            sender_id=300,
            sender_username="user123",
            text="Hello world",
            timestamp=1700000000,
        )

        assert event.message_id == 100
        assert event.chat_id == 200
        assert event.sender_id == 300
        assert event.sender_username == "user123"
        assert event.text == "Hello world"
        assert event.timestamp == 1700000000

    def test_message_event_optional_username(self) -> None:
        """Test MessageEvent with None username."""
        from handlers import MessageEvent

        event = MessageEvent(
            message_id=1,
            chat_id=2,
            sender_id=3,
            sender_username=None,
            text="Hi",
            timestamp=0,
        )

        assert event.sender_username is None


# ---------------------------------------------------------------------------
# Entity type detection tests
# ---------------------------------------------------------------------------


class TestEntityTypeDetection:
    """Tests for Telegram entity type detection."""

    def test_entity_type_user(self) -> None:
        """Test user entity type detection."""
        from handlers import CommandHandler

        entity = MagicMock()
        from telethon.tl.types import User
        entity.__class__ = User

        result = CommandHandler._entity_type(entity)
        assert result == "user"

    def test_entity_type_unknown(self) -> None:
        """Test unknown entity type returns 'unknown'."""
        from handlers import CommandHandler

        entity = MagicMock()
        # Not a recognized Telethon type
        result = CommandHandler._entity_type(entity)
        assert result == "unknown"


# ---------------------------------------------------------------------------
# TelethonUserbot tests
# ---------------------------------------------------------------------------


class TestTelethonUserbot:
    """Tests for the main TelethonUserbot class."""

    def test_environment_config(self, monkeypatch) -> None:
        """Test that environment variables are correctly read."""
        from main import TelethonUserbot

        monkeypatch.setenv("TELETHON_API_ID", "12345")
        monkeypatch.setenv("TELETHON_API_HASH", "hash123")
        monkeypatch.setenv("TELETHON_PHONE", "+79991234567")

        userbot = TelethonUserbot()

        assert userbot._api_id == 12345
        assert userbot._api_hash == "hash123"
        assert userbot._phone == "+79991234567"

    def test_session_path_sanitization(self) -> None:
        """Test session path sanitization for phone numbers."""
        from main import TelethonUserbot

        userbot = TelethonUserbot()
        userbot._phone = "+7 (999) 123-45-67"
        userbot._session_dir = "/tmp/test_session"

        path = userbot._get_session_path()

        assert "79991234567" in path
        assert "+" not in path
        assert " " not in path
        assert "-" not in path

    def test_session_path_uses_env_override(self, monkeypatch, tmp_path) -> None:
        """Test that TELETHON_SESSION_DIR env var is respected."""
        from main import TelethonUserbot

        monkeypatch.setenv("TELETHON_SESSION_DIR", str(tmp_path))
        monkeypatch.setenv("TELETHON_API_ID", "1")
        monkeypatch.setenv("TELETHON_API_HASH", "h")
        monkeypatch.setenv("TELETHON_PHONE", "+79990000000")

        userbot = TelethonUserbot()

        path = userbot._get_session_path()
        assert str(tmp_path) in path

    def test_running_state(self) -> None:
        """Test initial running state."""
        from main import TelethonUserbot

        userbot = TelethonUserbot()
        assert userbot._running is False

    @pytest.mark.asyncio
    async def test_process_line_with_health_command(self) -> None:
        """Test _process_line dispatches health command."""
        from main import TelethonUserbot

        userbot = TelethonUserbot()
        # Manually set up handler
        from handlers import CommandHandler

        mock_client = AsyncMock()
        mock_client.is_connected = MagicMock(return_value=True)

        captured_responses: list[dict[str, Any]] = []
        userbot._handlers = CommandHandler(
            client=mock_client,
            send_response=lambda r: captured_responses.append(r),
        )

        captured_stdout: list[str] = []
        original_write = sys.stdout.write

        def capture_stdout(s: str) -> int:
            captured_stdout.append(s)
            return 0

        sys.stdout.write = capture_stdout  # type: ignore[assignment]

        try:
            request = json.dumps({
                "type": "health",
                "id": "test-health",
                "params": {},
            })

            await userbot._process_line(request)

            # The response is written to stdout as JSON
            json_lines = [l for l in captured_stdout if l.strip()]
            assert len(json_lines) > 0
            parsed = json.loads(json_lines[0])
            assert parsed["type"] == "health"
            assert parsed["id"] == "test-health"
        finally:
            sys.stdout.write = original_write  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Signal handling tests
# ---------------------------------------------------------------------------


class TestSignalHandling:
    """Tests for signal handling (SIGTERM/SIGINT)."""

    def test_signal_sets_running_false(self) -> None:
        """Test that _on_signal_sync sets running to False."""
        from main import TelethonUserbot

        userbot = TelethonUserbot()
        userbot._running = True

        userbot._on_signal_sync(signal.SIGTERM, None)

        assert userbot._running is False

    def test_sigint_sets_running_false(self) -> None:
        """Test that SIGINT sets running to False."""
        from main import TelethonUserbot

        userbot = TelethonUserbot()
        userbot._running = True

        userbot._on_signal_sync(signal.SIGINT, None)

        assert userbot._running is False


# ---------------------------------------------------------------------------
# Response format tests
# ---------------------------------------------------------------------------


class TestResponseFormat:
    """Tests for response format compliance with BridgeResponse protocol."""

    def test_response_has_required_fields(self) -> None:
        """Test all responses have type, id, data fields."""
        from main import make_response

        for resp_type in ["health", "send_result", "error", "message", "auth_result", "get_chats"]:
            result = json.loads(make_response(resp_type, "test-id", {}))
            assert "type" in result
            assert "id" in result
            assert "data" in result
            assert result["type"] == resp_type
            assert result["id"] == "test-id"

    def test_response_correlation_id_preserved(self) -> None:
        """Test that correlation ID is correctly propagated."""
        from main import make_response

        result = json.loads(make_response("health", "req-123-456"))
        assert result["id"] == "req-123-456"

    def test_write_response_produces_newline(self) -> None:
        """Test write_response appends newline."""
        from main import write_response

        captured: list[str] = []

        original_write = sys.stdout.write
        sys.stdout.write = lambda s: (captured.append(s), original_write(s))[1]  # type: ignore[assignment]

        try:
            write_response("health", "test")
            assert len(captured) > 0
            output = captured[-1]
            assert output.endswith("\n")
        finally:
            sys.stdout.write = original_write  # type: ignore[assignment]
