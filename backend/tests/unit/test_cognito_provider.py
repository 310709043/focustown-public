"""Unit tests for CognitoProvider's verify_access_token path.

These focus on the JWKS verify logic, which is the only piece of the
provider that runs without hitting AWS. Token issuance, refresh, and
password rotation are integration-level and live behind AWS_E2E.
"""

from __future__ import annotations

import time
from typing import Any

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwk, jwt

from app.core.config import Settings
from app.core.exceptions import AuthError
from app.infrastructure.auth.providers import _cognito_jwks
from app.infrastructure.auth.providers.cognito import CognitoProvider
from tests.unit.fakes import FakeUserRepo, make_user


REGION = "ap-northeast-1"
POOL_ID = "ap-northeast-1_TestPool"
CLIENT_ID = "client-abc"


def _make_rsa_keypair() -> tuple[rsa.RSAPrivateKey, dict[str, Any]]:
    """Generate an RSA keypair and the corresponding JWK dict.

    Returns the private key (used to sign test tokens) and a JWK dict that
    mirrors what Cognito publishes under /.well-known/jwks.json. The kid
    is fixed so the patched JWKS fetcher can locate it.
    """
    priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pub_pem = priv.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    key = jwk.construct(pub_pem.decode("utf-8"), algorithm="RS256")
    jwk_dict = key.to_dict()
    # Coerce any bytes fields to str — different jose versions return one
    # or the other, and python-jose's downstream jwt.decode wants strings.
    for field_name, value in list(jwk_dict.items()):
        if isinstance(value, bytes):
            jwk_dict[field_name] = value.decode("utf-8")
    jwk_dict.update({"kid": "test-kid", "alg": "RS256", "use": "sig", "kty": "RSA"})
    return priv, jwk_dict


def _sign_token(priv: rsa.RSAPrivateKey, claims: dict[str, Any], *, kid: str = "test-kid") -> str:
    priv_pem = priv.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return jwt.encode(claims, priv_pem.decode("utf-8"), algorithm="RS256", headers={"kid": kid})


@pytest.fixture(autouse=True)
def _reset_jwks_cache():
    _cognito_jwks._reset_for_tests()
    yield
    _cognito_jwks._reset_for_tests()


@pytest.fixture
def settings() -> Settings:
    return Settings(  # type: ignore[call-arg]
        auth_provider="cognito",
        aws_region=REGION,
        cognito_user_pool_id=POOL_ID,
        cognito_client_id=CLIENT_ID,
    )


@pytest.fixture
def keypair():
    return _make_rsa_keypair()


def _patch_jwks(monkeypatch, jwk_dict: dict[str, Any]) -> None:
    async def fake_get_jwk(*, region: str, pool_id: str, kid: str, **_):
        del region, pool_id
        if kid == jwk_dict["kid"]:
            return jwk_dict
        return None

    monkeypatch.setattr(_cognito_jwks, "get_jwk", fake_get_jwk)


async def test_verify_access_token_happy(settings, keypair, monkeypatch):
    priv, jwk_dict = keypair
    _patch_jwks(monkeypatch, jwk_dict)

    issuer = f"https://cognito-idp.{REGION}.amazonaws.com/{POOL_ID}"
    now = int(time.time())
    token = _sign_token(
        priv,
        {
            "sub": "cog-sub-1",
            "token_use": "access",
            "client_id": CLIENT_ID,
            "iss": issuer,
            "exp": now + 60,
            "iat": now,
        },
    )

    users = FakeUserRepo()
    seeded = make_user("local-1", email="u@example.com")
    users.users[seeded.id] = seeded
    users.cognito_subs[seeded.id] = "cog-sub-1"

    provider = CognitoProvider(settings, users=users)
    principal = await provider.verify_access_token(token)

    assert principal.user_id == "local-1"
    assert principal.raw_claims["sub"] == "cog-sub-1"


async def test_verify_rejects_id_token(settings, keypair, monkeypatch):
    priv, jwk_dict = keypair
    _patch_jwks(monkeypatch, jwk_dict)

    issuer = f"https://cognito-idp.{REGION}.amazonaws.com/{POOL_ID}"
    now = int(time.time())
    token = _sign_token(
        priv,
        {
            "sub": "cog-sub-1",
            "token_use": "id",  # NOT access
            "client_id": CLIENT_ID,
            "iss": issuer,
            "exp": now + 60,
        },
    )

    provider = CognitoProvider(settings, users=FakeUserRepo())
    with pytest.raises(AuthError, match="not_an_access_token"):
        await provider.verify_access_token(token)


async def test_verify_rejects_wrong_client_id(settings, keypair, monkeypatch):
    priv, jwk_dict = keypair
    _patch_jwks(monkeypatch, jwk_dict)

    issuer = f"https://cognito-idp.{REGION}.amazonaws.com/{POOL_ID}"
    now = int(time.time())
    token = _sign_token(
        priv,
        {
            "sub": "cog-sub-1",
            "token_use": "access",
            "client_id": "other-client",  # not ours
            "iss": issuer,
            "exp": now + 60,
        },
    )

    provider = CognitoProvider(settings, users=FakeUserRepo())
    with pytest.raises(AuthError, match="invalid_client_id"):
        await provider.verify_access_token(token)


async def test_verify_rejects_unknown_kid(settings, keypair, monkeypatch):
    priv, jwk_dict = keypair
    _patch_jwks(monkeypatch, jwk_dict)

    issuer = f"https://cognito-idp.{REGION}.amazonaws.com/{POOL_ID}"
    now = int(time.time())
    token = _sign_token(
        priv,
        {
            "sub": "cog-sub-1",
            "token_use": "access",
            "client_id": CLIENT_ID,
            "iss": issuer,
            "exp": now + 60,
        },
        kid="bogus-kid",
    )

    provider = CognitoProvider(settings, users=FakeUserRepo())
    with pytest.raises(AuthError, match="unknown_kid"):
        await provider.verify_access_token(token)


async def test_verify_rejects_when_user_not_provisioned(settings, keypair, monkeypatch):
    """Valid token, but no local row carries the sub — we treat that as
    auth failure rather than 500, so the client can run signup."""
    priv, jwk_dict = keypair
    _patch_jwks(monkeypatch, jwk_dict)

    issuer = f"https://cognito-idp.{REGION}.amazonaws.com/{POOL_ID}"
    now = int(time.time())
    token = _sign_token(
        priv,
        {
            "sub": "cog-sub-2",
            "token_use": "access",
            "client_id": CLIENT_ID,
            "iss": issuer,
            "exp": now + 60,
        },
    )

    provider = CognitoProvider(settings, users=FakeUserRepo())  # empty
    with pytest.raises(AuthError, match="user_not_provisioned"):
        await provider.verify_access_token(token)


def test_constructor_rejects_missing_pool_or_client():
    s = Settings(  # type: ignore[call-arg]
        auth_provider="cognito",
        aws_region=REGION,
        cognito_user_pool_id="",
        cognito_client_id="",
    )
    with pytest.raises(RuntimeError, match="COGNITO_USER_POOL_ID"):
        CognitoProvider(s, users=FakeUserRepo())
