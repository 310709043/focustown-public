from __future__ import annotations

from dataclasses import dataclass

from app.core.clock import IClock
from app.core.exceptions import AuthError, NotFoundError, ValidationError
from app.core.ids import IIdGenerator
from app.core.security import (
    hash_password,
    validate_password_strength,
    verify_password,
)
from app.domain.models import User
from app.domain.repositories.shop_repo import IShopRepo
from app.domain.repositories.user_repo import IUserRepo
from app.domain.services.equipment_service import VehicleRenderMeta
from app.infrastructure.auth.providers.base import (
    AuthCredentials,
    AuthProvider,
    TokenPair,
)


@dataclass(slots=True, frozen=True)
class AuthOutcome:
    """Result of a successful sign-up / sign-in: the User plus a fresh
    token pair. Routers map this into the wire-level ``AuthResponse``.
    """

    user: User
    tokens: TokenPair


class AuthService:
    """Owns the business rules behind /signup, /signin and /me.

    The HTTP router stays thin: it validates the wire-level schema, runs
    rate limits, and shapes the response — every other rule lives here
    so that adding MFA, social login or a different identity provider
    only requires editing one place.

    SOLID:
    - S: each method maps to one user-facing flow.
    - D: depends on Protocols (``IUserRepo``, ``AuthProvider``, ``IClock``,
      ``IIdGenerator``) — never on concrete adapters.
    """

    def __init__(
        self,
        *,
        users: IUserRepo,
        auth_provider: AuthProvider,
        ids: IIdGenerator,
        clock: IClock,
    ) -> None:
        self._users = users
        self._auth = auth_provider
        self._ids = ids
        self._clock = clock

    async def sign_up(
        self,
        *,
        email: str,
        password: str,
        display_name: str,
        terms_accepted: bool,
        terms_version: str,
        marketing_opt_in: bool,
        terms_current_version: str,
    ) -> AuthOutcome:
        if not terms_accepted:
            raise ValidationError("terms_must_be_accepted")
        if terms_version != terms_current_version:
            raise ValidationError("terms_version_mismatch")

        validate_password_strength(password)

        # Provision identity at the provider first. LocalJWTProvider is a
        # no-op (returns ""); CognitoProvider creates the user in the pool
        # and returns the Cognito sub. Doing it before the local INSERT
        # gives us an actionable failure surface (UsernameExistsException
        # vs ConflictError) without first writing a half-row.
        external_id = await self._auth.sign_up_user(email=email, password=password)

        now = self._clock.now()
        user = await self._users.create(
            user_id=self._ids.new_id(),
            email=email,
            password_hash=hash_password(password),
            display_name=display_name,
            terms_accepted_at=now,
            terms_version=terms_version,
            marketing_opt_in=marketing_opt_in,
            marketing_opt_in_at=now if marketing_opt_in else None,
            cognito_sub=external_id or None,
        )
        tokens = await self._auth.issue_tokens(
            user_id=user.id,
            credentials=AuthCredentials(email=email, password=password),
        )
        return AuthOutcome(user=user, tokens=tokens)

    async def sign_in(self, *, email: str, password: str) -> AuthOutcome:
        creds = await self._users.get_credentials_by_email(email)
        if creds is None or not verify_password(password, creds.password_hash):
            raise AuthError("invalid_credentials")
        tokens = await self._auth.issue_tokens(
            user_id=creds.user.id,
            credentials=AuthCredentials(email=email, password=password),
        )
        return AuthOutcome(user=creds.user, tokens=tokens)

    async def get_me_with_vehicle(
        self,
        user_id: str,
        *,
        shop: IShopRepo,
    ) -> tuple[User, VehicleRenderMeta | None]:
        user = await self._users.get_by_id(user_id)
        if user is None:
            raise NotFoundError("user_not_found")
        vehicle: VehicleRenderMeta | None = None
        if user.equipped_vehicle_item_id:
            metas = await shop.get_render_metas([user.equipped_vehicle_item_id])
            vehicle = VehicleRenderMeta.from_json(
                metas.get(user.equipped_vehicle_item_id)
            )
        return user, vehicle
