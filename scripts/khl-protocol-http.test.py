"""@spec spec://modules/khl/INFRA-001-khl-data-ingestion#protocols"""
import importlib.util
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest

# The transport contract needs no network or installed curl wheel.
sys.modules["curl_cffi"] = SimpleNamespace(requests=None)
spec = importlib.util.spec_from_file_location("khl_http", Path(__file__).with_name("khl-protocol-http.py"))
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)


class Response:
    def __init__(self, status, location=None, chunks=(b"ok",)):
        self.status_code, self.headers, self.chunks = status, {"location": location}, chunks
        self.closed = False

    def iter_content(self):
        yield from self.chunks

    def close(self):
        self.closed = True


class Session:
    def __init__(self, responses):
        self.responses, self.calls = iter(responses), []

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        return next(self.responses)


class TransportTests(unittest.TestCase):
    url = "https://www.khl.ru/rest/game/protocol/"

    def test_anonymous_cookie_same_url_redirect_preserves_post_and_closes_bodies(self):
        responses = [Response(307, self.url), Response(200)]
        session = Session(responses)
        self.assertEqual(transport.body(session, "POST", self.url, data={"values[gameid]": "902038"}), "ok")
        self.assertEqual(session.calls[0], session.calls[1])
        self.assertFalse(session.calls[0][2]["allow_redirects"])
        self.assertTrue(all(r.closed for r in responses))

    def test_redirect_loop_has_hard_limit(self):
        responses = [Response(307, self.url) for _ in range(3)]
        session = Session(responses)
        with self.assertRaisesRegex(ValueError, "PROTOCOL_HTTP_307"):
            transport.body(session, "GET", self.url)
        self.assertEqual(len(session.calls), 3)
        self.assertTrue(all(r.closed for r in responses))

    def test_different_url_and_http_denial_are_never_followed(self):
        for status, target in [(307, "https://example.org/"), (307, self.url + "extra"), (403, None), (429, None)]:
            response = Response(status, target)
            session = Session([response])
            with self.assertRaisesRegex(ValueError, f"PROTOCOL_HTTP_{status}"):
                transport.body(session, "GET", self.url)
            self.assertEqual(len(session.calls), 1)
            self.assertTrue(response.closed)

    def test_oversized_stream_is_closed_before_ingestion(self):
        response = Response(200, chunks=(b"x" * transport.LIMIT, b"x"))
        with self.assertRaisesRegex(ValueError, "PROTOCOL_BODY_TOO_LARGE"):
            transport.body(Session([response]), "GET", self.url)
        self.assertTrue(response.closed)


if __name__ == "__main__":
    unittest.main()
