from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr, Field

_DISPLAY_NAME_PATTERN = r"^[^\r\n\t\x00-\x1f\x7f]+$"


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    # Block CR/LF/TAB and other C0/C1 control chars to prevent log/email-header
    # injection downstream (e.g. once SESNotifier replaces LogNotifier).
    display_name: str = Field(min_length=1, max_length=64, pattern=_DISPLAY_NAME_PATTERN)
    terms_accepted: bool
    terms_version: str = Field(min_length=1, max_length=16)
    marketing_opt_in: bool = False


class SignInRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    locale: Literal["en", "zh-TW"] = "zh-TW"


class ResetPasswordRequest(BaseModel):
    # Service issues 32-byte tokens encoded as urlsafe base64 → 43 chars. Set
    # the floor at 32 to leave some slack while still rejecting truncated
    # guesses well below the issuer's entropy floor.
    token: str = Field(min_length=32, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class TokensResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105 — OAuth2 scheme name, not a secret


class VehicleViewBrief(BaseModel):
    icon: str
    body_color: str
    roof_color: str


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str
    character_key: str | None = None
    role_label: str | None = None
    marketing_opt_in: bool = False
    equipped_vehicle_item_id: str | None = None
    equipped_vehicle: VehicleViewBrief | None = None


class AuthResponse(BaseModel):
    user: UserResponse
    tokens: TokensResponse


class OkResponse(BaseModel):
    ok: bool = True
