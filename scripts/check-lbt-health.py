#!/usr/bin/env python3
"""Public, read-only checks. No guest creation, messages, or admin credentials."""
import json
import subprocess
import sys
import time

SITE = "https://www.lowbatterytown.com"
API = "https://api.lowbatterytown.com"


def fetch(path, *, json_body=False):
    # Use the OS trust store through curl, including on owner Macs whose Python
    # installation may lack a certificate bundle. Never disable TLS validation.
    result = subprocess.run(["curl", "--silent", "--show-error", "--fail", "--location",
        "--proto", "=https", "--proto-redir", "=https", "--connect-timeout", "10",
        "--max-time", "15", "--max-filesize", "2000000", "--user-agent",
        "LowBatteryTown-health-check", path], capture_output=True, timeout=20, check=True)
    return json.loads(result.stdout) if json_body else result.stdout.decode("utf-8")


def check(fetcher=fetch):
    failures = []
    checks = [
        ("website", SITE + "/zh-TW", False, lambda data: "LowBatteryTown" in data and "data-lbt-time" in data),
        ("API health", API + "/healthz", True, lambda data: isinstance(data, dict) and data.get("ok") is True),
        ("chat status", API + "/api/v1/lbt/status", True, valid_status),
    ]
    for name, url, is_json, valid in checks:
        try:
            if not valid(fetcher(url, json_body=is_json)):
                failures.append(name + ": unexpected response")
        except Exception as error:
            # Only the error class; upstream response text can contain private data.
            failures.append(name + ": " + type(error).__name__)
    return failures


def valid_status(data):
    return (isinstance(data, dict)
            and type(data.get("online")) is int and data["online"] >= 0
            and type(data.get("waiting")) is int and 0 <= data["waiting"] <= data["online"]
            and type(data.get("open")) is bool and isinstance(data.get("hours"), str))


if __name__ == "__main__":
    failures = check()
    if failures:
        time.sleep(5)
        failures = check()
    print("\n".join(failures) if failures else "OK: website, API health and chat status")
    sys.exit(bool(failures))
