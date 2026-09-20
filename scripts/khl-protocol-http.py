"""@spec spec://modules/khl/INFRA-001-khl-data-ingestion#protocols

One-shot public HTTP reader. No browser, JavaScript engine, disk cache or user cookies.
"""
import json
import re
import sys

from curl_cffi import requests

LIMIT = 5 * 1024 * 1024


def body(session, method, url, **kwargs):
    for attempt in range(3):
        response = session.request(method, url, timeout=(10, 20), allow_redirects=False,
                                   stream=True, **kwargs)
        # The site sets an anonymous cookie via a 307 to exactly the same URL.
        # Follow at most twice; never follow a different host/path or change POST.
        if response.status_code in (307, 308) and response.headers.get("location") == url and attempt < 2:
            response.close()
            continue
        break
    try:
        if response.status_code != 200:
            raise ValueError(f"PROTOCOL_HTTP_{response.status_code}")
        chunks, size = [], 0
        for chunk in response.iter_content():
            size += len(chunk)
            if size > LIMIT:
                raise ValueError("PROTOCOL_BODY_TOO_LARGE")
            chunks.append(chunk)
        return b"".join(chunks).decode("utf-8")
    finally:
        response.close()


def main():
    if len(sys.argv) != 3 or not re.fullmatch(r"\d{1,10}", sys.argv[1]) or not re.fullmatch(r"\d{1,12}", sys.argv[2]):
        raise ValueError("PROTOCOL_SCOPE_INVALID")
    season, match = sys.argv[1:]
    with requests.Session(impersonate="chrome136") as session:
        page = body(session, "GET", f"https://www.khl.ru/game/{season}/{match}/protocol/")
        token = re.search(r"['\"]bitrix_sessid['\"]\s*:\s*['\"]([a-fA-F0-9]{32})['\"]", page)
        if not token:
            raise ValueError("PROTOCOL_SESSION_UNAVAILABLE")
        raw = body(session, "POST", "https://www.khl.ru/rest/game/protocol/", data={
            "values[tournament]": season, "values[gameid]": match,
            "values[is_print]": "false", "sessid": token[1],
        })
        payload = json.loads(raw)
        if payload.get("status") != "success" or not payload.get("data", {}).get("teams"):
            raise ValueError("PROTOCOL_RESPONSE_INVALID")
        # Never return the anonymous session token or HTML page to the caller/log.
        sys.stdout.write(raw)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Curl errors can contain request detail. Only expose our finite error codes.
        message = str(error)
        sys.stderr.write(message if re.fullmatch(r"PROTOCOL_[A-Z0-9_]+", message) else "PROTOCOL_TRANSPORT_FAILED")
        sys.exit(1)
