import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("health", Path(__file__).with_name("check-lbt-health.py"))
health = importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)


class HealthChecks(unittest.TestCase):
    def fetch(self, url, *, json_body=False):
        if url.endswith("healthz"):
            return {"ok": True}
        if url.endswith("status"):
            return {"online": 0, "waiting": 0, "open": False, "hours": "21:00-24:00"}
        return "LowBatteryTown data-lbt-time"

    def test_closed_town_is_healthy(self):
        self.assertEqual(health.check(self.fetch), [])

    def test_wrong_health_response_fails(self):
        self.assertEqual(len(health.check(lambda *_args, **_kwargs: {"ok": False})), 3)

    def test_invalid_counts_rejected(self):
        for data in [{"online": True, "waiting": 0, "open": True, "hours": ""},
                     {"online": 0, "waiting": 1, "open": True, "hours": ""}]:
            self.assertFalse(health.valid_status(data))

    def test_errors_do_not_disclose_response(self):
        def broken(*_args, **_kwargs):
            raise ValueError("sensitive upstream content")
        result = health.check(broken)
        self.assertEqual(len(result), 3)
        self.assertNotIn("sensitive", " ".join(result))


if __name__ == "__main__":
    unittest.main()
