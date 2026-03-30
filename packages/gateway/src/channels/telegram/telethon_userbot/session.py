"""
Encrypted session storage for Telethon userbot.

Provides AES-256-GCM encryption for Telethon session files stored at
~/.osai/channels/telegram/session/. Uses PBKDF2-HMAC-SHA256 for key
derivation from a passphrase.

Security:
- AES-256-GCM (authenticated encryption)
- PBKDF2 with 600 000 iterations for key derivation
- Random 256-bit salt per session
- 96-bit nonce per encryption operation
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

logger = logging.getLogger("telethon_userbot.session")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_SESSION_DIR_NAME = "session"
_KEY_ITERATIONS = 600_000
_SALT_SIZE = 32
_NONCE_SIZE = 12  # 96 bits for AES-GCM
_KEY_SIZE = 32  # 256 bits for AES-256

# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class EncryptedSession:
    """Container for encrypted session data."""

    salt: bytes
    nonce: bytes
    ciphertext: bytes


# ---------------------------------------------------------------------------
# SessionCrypto
# ---------------------------------------------------------------------------


class SessionCrypto:
    """Handles AES-256-GCM encryption/decryption for Telethon sessions."""

    def __init__(self, passphrase: str) -> None:
        if not passphrase:
            raise ValueError("Passphrase must not be empty")
        self._passphrase = passphrase.encode("utf-8")

    def _derive_key(self, salt: bytes) -> bytes:
        """Derive AES-256 key from passphrase using PBKDF2-HMAC-SHA256."""
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=_KEY_SIZE,
            salt=salt,
            iterations=_KEY_ITERATIONS,
        )
        return kdf.derive(self._passphrase)

    def encrypt(self, plaintext: bytes) -> EncryptedSession:
        """Encrypt plaintext bytes with AES-256-GCM.

        Returns an EncryptedSession containing salt, nonce, and ciphertext.
        """
        salt = os.urandom(_SALT_SIZE)
        key = self._derive_key(salt)
        nonce = os.urandom(_NONCE_SIZE)

        aesgcm = AESGCM(key)
        ciphertext = aesgcm.encrypt(nonce, plaintext, None)

        return EncryptedSession(salt=salt, nonce=nonce, ciphertext=ciphertext)

    def decrypt(self, session: EncryptedSession) -> bytes:
        """Decrypt ciphertext with AES-256-GCM.

        Raises cryptography.exceptions.InvalidTag if passphrase is wrong.
        """
        key = self._derive_key(session.salt)
        aesgcm = AESGCM(key)
        return aesgcm.decrypt(session.nonce, session.ciphertext, None)


# ---------------------------------------------------------------------------
# SessionStore
# ---------------------------------------------------------------------------


class SessionStore:
    """Manages encrypted storage of Telethon session data on disk.

    Session files are stored as JSON:
    {
        "version": 1,
        "salt": "<base64>",
        "nonce": "<base64>",
        "ciphertext": "<base64>"
    }
    """

    FORMAT_VERSION = 1

    def __init__(
        self,
        session_dir: Optional[str] = None,
        passphrase: Optional[str] = None,
    ) -> None:
        if session_dir:
            self._session_dir = Path(session_dir)
        else:
            home = Path.home()
            self._session_dir = home / ".osai" / "channels" / "telegram" / _SESSION_DIR_NAME

        self._passphrase = passphrase or self._default_passphrase()
        self._crypto = SessionCrypto(self._passphrase)

    @staticmethod
    def _default_passphrase() -> str:
        """Generate a default passphrase from machine-specific data.

        Uses a combination of username and hostname hashed with SHA-256.
        """
        import platform

        raw = f"osai-telethon-session-{os.getlogin()}-{platform.node()}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def _ensure_dir(self) -> None:
        """Create session directory if it does not exist."""
        self._session_dir.mkdir(parents=True, exist_ok=True)

    def _session_file_path(self, phone: str) -> Path:
        """Get the path to the session file for a given phone number."""
        sanitized = phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        return self._session_dir / f"{sanitized}.enc"

    def save(self, phone: str, data: bytes) -> Path:
        """Encrypt and save session data for a phone number.

        Returns the path to the saved session file.
        """
        self._ensure_dir()
        encrypted = self._crypto.encrypt(data)
        session_file = self._session_file_path(phone)

        payload = {
            "version": self.FORMAT_VERSION,
            "salt": base64.b64encode(encrypted.salt).decode("ascii"),
            "nonce": base64.b64encode(encrypted.nonce).decode("ascii"),
            "ciphertext": base64.b64encode(encrypted.ciphertext).decode("ascii"),
        }

        session_file.write_text(
            json.dumps(payload, indent=2), encoding="utf-8"
        )

        logger.debug(
            {"phone": phone, "path": str(session_file)},
            "Session saved",
        )
        return session_file

    def load(self, phone: str) -> Optional[bytes]:
        """Load and decrypt session data for a phone number.

        Returns None if session file does not exist.
        Raises if decryption fails (wrong passphrase).
        """
        session_file = self._session_file_path(phone)

        if not session_file.exists():
            logger.debug({"phone": phone}, "No existing session file")
            return None

        raw = session_file.read_text(encoding="utf-8")
        payload = json.loads(raw)

        if payload.get("version") != self.FORMAT_VERSION:
            raise ValueError(
                f"Unsupported session format version: {payload.get('version')}"
            )

        encrypted = EncryptedSession(
            salt=base64.b64decode(payload["salt"]),
            nonce=base64.b64decode(payload["nonce"]),
            ciphertext=base64.b64decode(payload["ciphertext"]),
        )

        plaintext = self._crypto.decrypt(encrypted)

        logger.debug({"phone": phone}, "Session loaded and decrypted")
        return plaintext

    def exists(self, phone: str) -> bool:
        """Check if a session file exists for a phone number."""
        return self._session_file_path(phone).exists()

    def delete(self, phone: str) -> bool:
        """Delete session file for a phone number.

        Returns True if file was deleted, False if it did not exist.
        """
        session_file = self._session_file_path(phone)
        if session_file.exists():
            session_file.unlink()
            logger.debug({"phone": phone}, "Session file deleted")
            return True
        return False

    @property
    def session_dir(self) -> Path:
        """Return the session directory path."""
        return self._session_dir
