from __future__ import annotations

import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

_PHONE_RE = re.compile(r"^\+?998\d{9}$")


def _normalize_phone(v: str) -> str:
    if not _PHONE_RE.match(v):
        raise ValueError(
            "Phone must start with +998 or 998 and contain exactly 12 digits total"
        )
    return v if v.startswith("+") else f"+{v}"


def normalize_contact_phone(v: str | None) -> str | None:
    """A phone typed into a form ("+998 90 123-45-67") as +998XXXXXXXXX.
    Blank means not given; anything that is not an Uzbek number is refused,
    so a shop or an usta is never left with a number it cannot call."""
    if v is None or not v.strip():
        return None
    return _normalize_phone(re.sub(r"[\s\-()]", "", v))


class OTPRequest(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return _normalize_phone(v)


class OTPVerify(BaseModel):
    phone: str
    code: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return _normalize_phone(v)


class UserOut(BaseModel):
    id: UUID
    phone: str | None
    username: str | None
    name: str | None
    # Admins may remove shared library content (uploaded wallpapers)
    is_admin: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    """Returned by auth endpoints.

    JWTs are ALWAYS set as HttpOnly cookies. They are ALSO echoed in this
    response body, but only for native app clients (Flutter/Capacitor),
    which manage their own Bearer-token auth and don't get a browser cookie
    jar. Web (browser) requests get `null` here and must rely on the cookies
    — see `_is_native_client()` in app/routers/auth.py for the detection
    logic, so an XSS bug in the web client can't exfiltrate a token that was
    never in the response it can read.
    """

    user: UserOut
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"


class RegisterRequest(BaseModel):
    # The sign-up form's own limits (LoginPage). username is varchar(50); an
    # empty password made an account that could never self-delete.
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=128)
    name: str | None = Field(default=None, max_length=100)

    @field_validator("username", mode="before")
    @classmethod
    def _strip_username(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v


class LoginRequest(BaseModel):
    username: str
    password: str


class GoogleLoginRequest(BaseModel):
    """A Google ID token (JWT) from Google Identity Services / Google Sign-In."""

    id_token: str = Field(min_length=1, max_length=8192)


class DeleteAccountRequest(BaseModel):
    """Password is required only when the account has one (phone/OTP-only
    accounts have none)."""

    password: str | None = None
