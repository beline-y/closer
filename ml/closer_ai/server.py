"""Local JSON API for the care tab of the Closer app. Standard library only.

Only the Next.js server calls it, with a shared secret, after checking with Supabase (RLS)
that the signed-in care team member may see the child. The browser never reaches it. It
listens on localhost: a demo service for fictional data, not a hardened public server.

    POST /v1/patients/<id>/sync                the app's check-ins in, the care-tab report out
    PUT  /v1/patients/<id>/observations/<day>  the nurse's round in, the updated report out
    POST /v1/patients/<id>/drawings            a drawing in (base64), its reading and the updated report out
    GET  /v1/patients/<id>/drawings/<day>      the drawings page: every drawing and this week against the usual
    POST /v1/overview                          several syncs at once, one line per child out
    GET  /v1/menu/<day>, PUT /v1/menu/<day>    the ward's menu
    POST /v1/matching                          children, volunteer roster and requests in, this week's matching out
    POST /v1/matching/suggestions              the same, after recording that a volunteer was suggested to a child
    POST /v1/matching/visits                   the same, after recording how a visit went
    GET  /v1/health                            no secret needed, says nothing about children

Every sync or round re-runs the daily job for that child when its inputs changed, so the
report the nurse reads is always computed from what the nurse just entered.
"""

from __future__ import annotations

import hmac
import json
import logging
import re
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .bridge import (
    MAX_IMAGE, BadRequest, Engine, drawings_view, ingest_drawing, matching_view, menu_from_json, observation_from_json, open_store,
    overview_row, patient_id, report, parse_day, sync_patient,
)

log = logging.getLogger(__name__)
MAX_BODY = 1_000_000
ROUTES = (
    ("POST", re.compile(r"/v1/patients/([^/]+)/sync"), "sync"),
    ("PUT", re.compile(r"/v1/patients/([^/]+)/observations/(\d{4}-\d{2}-\d{2})"), "observation"),
    ("POST", re.compile(r"/v1/patients/([^/]+)/drawings"), "drawing"),
    ("GET", re.compile(r"/v1/patients/([^/]+)/drawings/(\d{4}-\d{2}-\d{2})"), "drawings"),
    ("POST", re.compile(r"/v1/overview"), "overview"),
    ("GET", re.compile(r"/v1/menu/(\d{4}-\d{2}-\d{2})"), "get_menu"),
    ("PUT", re.compile(r"/v1/menu/(\d{4}-\d{2}-\d{2})"), "put_menu"),
    ("POST", re.compile(r"/v1/matching"), "matching"),
    ("POST", re.compile(r"/v1/matching/suggestions"), "suggest_volunteer"),
    ("POST", re.compile(r"/v1/matching/visits"), "rate_visit"),
    ("GET", re.compile(r"/v1/health"), "health"),
)


class CareTabAPI:
    def __init__(self, db: str | Path, engine: Engine, token: str):
        self.db, self.engine, self.token = str(db), engine, token
        open_store(self.db).close()  # create the file and check its schema once, at startup

    # Each handler gets its own SQLite connection: requests run in parallel threads.
    def sync(self, store, body, pid):
        today = sync_patient(store, patient_id(pid), body)
        self.engine.refresh(store, pid, today)
        return report(store, pid, today, self.engine)

    def observation(self, store, body, pid, day):
        pid, today = patient_id(pid), parse_day(day)
        if store.data_version(pid) is None:
            raise BadRequest("unknown patient: sync it first")
        observation, visits = observation_from_json(body.get("observation") or {})
        store.put_observation(pid, today, observation, visits, (body.get("observed_by") or "")[:80] or None)
        self.engine.refresh(store, pid, today)
        return report(store, pid, today, self.engine)

    def drawing(self, store, body, pid):
        drawing = ingest_drawing(store, self.engine, patient_id(pid), body)
        today = parse_day(body.get("today") or body.get("local_date"))
        self.engine.refresh(store, pid, today)
        return {"drawing": drawing, "report": report(store, pid, today, self.engine)}

    def drawings(self, store, body, pid, day):
        return drawings_view(store, patient_id(pid), parse_day(day))

    def overview(self, store, body):
        children = body.get("patients") or []
        if not isinstance(children, list) or len(children) > 200:
            raise BadRequest("patients must be a list of at most 200 children")

        def one(child: dict) -> dict:
            own = open_store(self.db)
            try:
                pid = patient_id(str(child.get("id", "")))
                today = sync_patient(own, pid, child)
                self.engine.refresh(own, pid, today)
                return overview_row(own, pid, today)
            finally:
                own.close()

        with ThreadPoolExecutor(max_workers=4) as pool:  # each stale child may wait on one Claude call
            return {"patients": list(pool.map(one, children))}

    def get_menu(self, store, body, day):
        return store.menu(parse_day(day))

    def put_menu(self, store, body, day):
        store.put_menu(parse_day(day), menu_from_json(body))
        return store.menu(parse_day(day))

    def matching(self, store, body):
        return matching_view(store, self.engine, body)

    def suggest_volunteer(self, store, body):
        return matching_view(store, self.engine, body, suggestion=body.get("suggestion") or {})

    def rate_visit(self, store, body):
        return matching_view(store, self.engine, body, rating=body.get("visit") or {})

    def health(self, store, body):
        return {"ok": True, "claude": self.engine.claude, "model_version": self.engine.version}

    # -- HTTP plumbing ----------------------------------------------------------------------------
    def handler(self):
        api = self

        class Handler(BaseHTTPRequestHandler):
            server_version = "closer-ai"

            def do_GET(self):
                self._dispatch("GET")

            def do_POST(self):
                self._dispatch("POST")

            def do_PUT(self):
                self._dispatch("PUT")

            def log_message(self, fmt, *args):  # method and path only, never bodies
                log.info("%s - %s", self.address_string(), fmt % args)

            def _dispatch(self, method: str) -> None:
                path = self.path.split("?", 1)[0]
                route = next(((name, m) for verb, pattern, name in ROUTES
                              if verb == method and (m := pattern.fullmatch(path))), None)
                if route is None:
                    return self._send(HTTPStatus.NOT_FOUND, {"error": "not found"})
                name, match = route
                if name != "health" and not hmac.compare_digest(
                        self.headers.get("Authorization", "").encode(), f"Bearer {api.token}".encode()):
                    return self._send(HTTPStatus.UNAUTHORIZED, {"error": "missing or wrong secret"})
                try:
                    body = self._body(MAX_IMAGE * 4 // 3 + 10_000 if name == "drawing" else MAX_BODY) \
                        if method in ("POST", "PUT") else {}
                    store = open_store(api.db)
                    try:
                        result = getattr(api, name)(store, body, *match.groups())
                    finally:
                        store.close()
                except BadRequest as error:
                    return self._send(HTTPStatus.BAD_REQUEST, {"error": str(error)})
                except sqlite3.IntegrityError as error:
                    return self._send(HTTPStatus.BAD_REQUEST, {"error": f"rejected by the store: {error}"})
                except Exception:
                    log.exception("care-tab request failed")
                    return self._send(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "internal error"})
                self._send(HTTPStatus.OK, result)

            def _body(self, limit: int) -> dict:
                length = int(self.headers.get("Content-Length") or 0)
                if length > limit:
                    raise BadRequest("body too large")
                try:
                    body = json.loads(self.rfile.read(length) or b"{}")
                except json.JSONDecodeError:
                    raise BadRequest("body is not JSON") from None
                if not isinstance(body, dict):
                    raise BadRequest("body must be a JSON object")
                return body

            def _send(self, status: HTTPStatus, payload: dict) -> None:
                data = json.dumps(payload, ensure_ascii=False).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(data)

        return Handler

    def serve(self, host: str, port: int) -> None:
        httpd = ThreadingHTTPServer((host, port), self.handler())
        httpd.daemon_threads = True
        print(f"Care-tab API on http://{host}:{port} (Claude {'on' if self.engine.claude else 'off'}, "
              f"models {self.engine.version})", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            httpd.server_close()
