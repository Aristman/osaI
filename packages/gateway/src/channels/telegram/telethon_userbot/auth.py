"""
Authentication module for Telethon userbot.

Handles the Telegram auth flow:
1. Send phone number to Telegram
2. Receive verification code (via JSON-over-stdio from Node.js parent)
3. If 2FA enabled, provide password (via JSON-over-stdio from Node.js parent)
4. Store encrypted session on success

Protocol messages:
- auth_request: Node.js sends phone number for auth
- auth_code_request: Python asks Node.js to provide the code
- auth_code: Node.js sends the code back
- auth_2fa_request: Python asks for 2FA password
- auth_2fa_password: Node.js sends the 2FA password
- auth_result: Python sends final auth result
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Callable, Optional

logger = logging.getLogger("telethon_userbot.auth")


# ---------------------------------------------------------------------------
# Auth state types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AuthConfig:
    """Configuration for the auth flow."""

    api_id: int
    api_hash: str
    phone: str
    session_dir: Optional[str] = None
    passphrase: Optional[str] = None


@dataclass(frozen=True)
class AuthResult:
    """Result of the authentication flow."""

    success: bool
    user_id: Optional[int] = None
    username: Optional[str] = None
    first_name: Optional[str] = None
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Auth errors
# ---------------------------------------------------------------------------


class AuthError(Exception):
    """Base exception for auth flow errors."""


class AuthCodeRequired(AuthError):
    """Raised when Telegram requires a verification code."""

    def __init__(self, phone: str) -> None:
        self.phone = phone
        super().__init__(f"Verification code required for {phone}")


class Auth2FARequired(AuthError):
    """Raised when Telegram requires 2FA password."""

    def __init__(self) -> None:
        super().__init__("Two-factor authentication password required")


class AuthInvalidCode(AuthError):
    """Raised when the provided verification code is invalid."""

    def __init__(self) -> None:
        super().__init__("Invalid verification code")


class AuthPhoneError(AuthError):
    """Raised when the phone number is invalid or not registered."""


# ---------------------------------------------------------------------------
# AuthManager
# ---------------------------------------------------------------------------


class AuthManager:
    """Manages the Telethon authentication flow.

    Coordinates between the Telethon client and the Node.js parent process
    via the JSON-over-stdio protocol.
    """

    def __init__(
        self,
        config: AuthConfig,
        send_response: Callable[[dict[str, Any]], None],
    ) -> None:
        """Initialize AuthManager.

        Args:
            config: Auth configuration (api_id, api_hash, phone).
            send_response: Callback to send JSON responses to Node.js parent.
        """
        self._config = config
        self._send_response = send_response
        self._client: Any = None
        self._result: Optional[AuthResult] = None

    def set_client(self, client: Any) -> None:
        """Set the Telethon client instance (after creation)."""
        self._client = client

    async def authenticate(self) -> AuthResult:
        """Run the full authentication flow.

        1. Try to connect using existing session
        2. If not authorized, start phone code auth
        3. Request code from Node.js parent
        4. If 2FA, request password from Node.js parent
        5. Store encrypted session on success

        Returns:
            AuthResult with success status and user info.
        """
        from telethon import TelegramClient
        from telethon.errors import (
            SessionPasswordNeededError,
            PhoneCodeInvalidError,
            PhoneNumberInvalidError,
            PhoneNumberBannedError,
        )

        if self._client is None:
            raise AuthError("Telethon client not set")

        client: TelegramClient = self._client
        config = self._config

        try:
            # Try to connect and check if already authorized
            await client.connect()

            if await client.is_user_authorized():
                me = await client.get_me()
                result = AuthResult(
                    success=True,
                    user_id=me.id if me else None,
                    username=me.username if me else None,
                    first_name=me.first_name if me else None,
                )
                logger.info(
                    {"user_id": result.user_id, "username": result.username},
                    "Already authorized, session restored",
                )
                self._result = result
                return result

            # Not authorized -- start auth flow
            logger.info({"phone": config.phone}, "Starting phone auth")

            try:
                await client.send_code_request(config.phone)
            except PhoneNumberInvalidError:
                raise AuthPhoneError(
                    f"Invalid phone number: {config.phone}"
                )
            except PhoneNumberBannedError:
                raise AuthPhoneError(
                    f"Phone number banned: {config.phone}"
                )

            # Request code from Node.js parent
            self._send_code_request()

            # Wait for code (handled via on_code callback)
            raise AuthCodeRequired(config.phone)

        except AuthCodeRequired:
            raise
        except Auth2FARequired:
            raise
        except AuthError:
            raise
        except Exception as exc:
            logger.error(
                {"error": str(exc)},
                "Auth flow failed",
            )
            return AuthResult(success=False, error=str(exc))

    async def submit_code(self, code: str) -> AuthResult:
        """Submit verification code received from Node.js parent.

        Completes the auth flow after code is received.

        Args:
            code: The verification code from Telegram.

        Returns:
            AuthResult with success status and user info.
        """
        from telethon.errors import (
            SessionPasswordNeededError,
            PhoneCodeInvalidError,
        )

        if self._client is None:
            raise AuthError("Telethon client not set")

        client = self._client

        try:
            await client.sign_in(self._config.phone, code)
        except PhoneCodeInvalidError:
            await self._send_result(AuthResult(success=False, error="Invalid code"))
            raise AuthInvalidCode()
        except SessionPasswordNeededError:
            self._send_2fa_request()
            raise Auth2FARequired()

        me = await client.get_me()
        result = AuthResult(
            success=True,
            user_id=me.id if me else None,
            username=me.username if me else None,
            first_name=me.first_name if me else None,
        )
        self._result = result
        await self._send_result(result)
        return result

    async def submit_2fa_password(self, password: str) -> AuthResult:
        """Submit 2FA password received from Node.js parent.

        Args:
            password: The 2FA password.

        Returns:
            AuthResult with success status and user info.
        """
        if self._client is None:
            raise AuthError("Telethon client not set")

        client = self._client

        try:
            await client.sign_in(password=password)
        except Exception as exc:
            await self._send_result(
                AuthResult(success=False, error=f"2FA failed: {exc}")
            )
            raise AuthError(f"2FA authentication failed: {exc}")

        me = await client.get_me()
        result = AuthResult(
            success=True,
            user_id=me.id if me else None,
            username=me.username if me else None,
            first_name=me.first_name if me else None,
        )
        self._result = result
        await self._send_result(result)
        return result

    # -------------------------------------------------------------------
    # Protocol: send messages to Node.js parent
    # -------------------------------------------------------------------

    def _send_code_request(self) -> None:
        """Send auth_code_request to Node.js parent asking for verification code."""
        self._send_response({
            "type": "auth_code_request",
            "id": "auth",
            "data": {
                "phone": self._config.phone,
                "message": "Enter the verification code sent to your Telegram app",
            },
        })

    def _send_2fa_request(self) -> None:
        """Send auth_2fa_request to Node.js parent asking for 2FA password."""
        self._send_response({
            "type": "auth_2fa_request",
            "id": "auth",
            "data": {
                "message": "Two-factor authentication is enabled. Enter your password",
            },
        })

    async def _send_result(self, result: AuthResult) -> None:
        """Send auth_result to Node.js parent."""
        data: dict[str, Any] = {"success": result.success}
        if result.user_id:
            data["user_id"] = result.user_id
        if result.username:
            data["username"] = result.username
        if result.first_name:
            data["first_name"] = result.first_name
        if result.error:
            data["error"] = result.error

        self._send_response({
            "type": "auth_result",
            "id": "auth",
            "data": data,
        })

    # -------------------------------------------------------------------
    # Accessors
    # -------------------------------------------------------------------

    @property
    def result(self) -> Optional[AuthResult]:
        """Return the current auth result."""
        return self._result

    @property
    def is_authenticated(self) -> bool:
        """Check if authentication was successful."""
        return self._result is not None and self._result.success
