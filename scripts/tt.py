"""Small TomTom client shared by the profile scripts. Counts every call."""
import json, os, time, urllib.parse, urllib.request, datetime

KEY = os.environ.get("TOMTOM_API_KEY", "")
LOG = os.path.join(os.path.dirname(__file__), "..", "data", "raw", "tomtom_calls.log")


def get(path, **params):
    if not KEY:
        raise SystemExit("TOMTOM_API_KEY not set")
    params["key"] = KEY
    url = f"https://api.tomtom.com/{path}?" + urllib.parse.urlencode(params, safe=":,")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                body = json.load(r)
            break
        except urllib.error.HTTPError as e:
            body = {"error": e.code, "detail": e.read().decode()[:300]}
            if e.code in (429, 503):
                time.sleep(2 + attempt * 2)
                continue
            break
        except Exception as e:  # network blip
            body = {"error": str(e)}
            time.sleep(2)
    with open(LOG, "a") as f:
        f.write(f"{datetime.datetime.utcnow().isoformat()} {path.split('/')[0]}\n")
    time.sleep(0.25)  # stay under the free-tier QPS limit
    return body
