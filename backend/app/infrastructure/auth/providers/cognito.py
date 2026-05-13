from __future__ import annotations

from app.core.config import Settings
from app.infrastructure.auth.providers.base import AuthProvider, Principal, TokenPair


class CognitoProvider(AuthProvider):
    """Placeholder for AWS Cognito integration.

    Implement in v2: use boto3 / aws-jwt-verify equivalent to validate tokens
    against the configured user pool, and proxy issuance to Cognito's hosted UI
    or AdminInitiateAuth.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def issue_tokens(self, *, user_id: str) -> TokenPair:  # noqa: ARG002
        raise NotImplementedError("CognitoProvider.issue_tokens — implement in v2")

    async def refresh(self, refresh_token: str) -> TokenPair:  # noqa: ARG002
        raise NotImplementedError("CognitoProvider.refresh — implement in v2")

    async def verify_access_token(self, token: str) -> Principal:  # noqa: ARG002
        raise NotImplementedError("CognitoProvider.verify_access_token — implement in v2")
