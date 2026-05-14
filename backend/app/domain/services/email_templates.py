from __future__ import annotations

from typing import Literal, TypedDict

Locale = Literal["en", "zh-TW"]

DEFAULT_LOCALE: Locale = "zh-TW"


class EmailTemplate(TypedDict):
    subject: str
    body: str


class PasswordResetContext(TypedDict):
    name: str
    reset_link: str
    ttl_minutes: int


# Subject and body strings accept Python str.format kwargs from
# PasswordResetContext. Keys without placeholders are still valid.
PASSWORD_RESET_TEMPLATES: dict[Locale, EmailTemplate] = {
    "zh-TW": {
        "subject": "Focus Town — 重設您的密碼",
        "body": (
            "您好 {name},\n\n"
            "我們收到了重設密碼的請求。請點擊以下連結重設密碼:\n"
            "{reset_link}\n\n"
            "此連結將於 {ttl_minutes} 分鐘後失效。\n"
            "若您並未提出此請求, 請忽略本郵件。\n"
        ),
    },
    "en": {
        "subject": "Focus Town — Reset your password",
        "body": (
            "Hi {name},\n\n"
            "We received a request to reset your password. Click the link below to set a new one:\n"
            "{reset_link}\n\n"
            "This link will expire in {ttl_minutes} minutes.\n"
            "If you did not request this, you can safely ignore this email.\n"
        ),
    },
}


def render_password_reset_email(
    locale: Locale,
    context: PasswordResetContext,
) -> EmailTemplate:
    template = PASSWORD_RESET_TEMPLATES.get(locale) or PASSWORD_RESET_TEMPLATES[DEFAULT_LOCALE]
    return EmailTemplate(
        subject=template["subject"].format(**context),
        body=template["body"].format(**context),
    )
