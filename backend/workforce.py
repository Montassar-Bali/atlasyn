"""
ATLASYN Workforce — employee accounts, verified on-site attendance, and meeting rooms.

Attendance is verified server-side from the network address of each request: a check-in,
check-out, or presence heartbeat only counts when it arrives from a configured office
network. Nothing the browser sends can claim to be "on site".
"""

import asyncio
import hashlib
import hmac
import ipaddress
import json
import logging
import os
import secrets
import sqlite3
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from database import DB_PATH, get_db

logger = logging.getLogger("atlasyn_workforce")

router = APIRouter(prefix="/api")

# ── Configuration (environment) ──────────────────────────────────────────────

def _networks(value: str) -> List[ipaddress._BaseNetwork]:
    return [ipaddress.ip_network(item.strip(), strict=False) for item in value.split(",") if item.strip()]


# Default to loopback so the app works in local development; production sets the office's public IP/CIDR.
OFFICE_NETWORKS = _networks(os.getenv("ATLASYN_OFFICE_NETWORKS", "127.0.0.1/32,::1/128"))
OFFICE_LABEL = os.getenv("ATLASYN_OFFICE_LABEL", "ATLASYN HQ network")
# Reverse proxies whose X-Forwarded-For we trust. Empty means the socket address is the client.
TRUSTED_PROXIES = _networks(os.getenv("ATLASYN_TRUSTED_PROXIES", ""))
COMPANY_TZ = ZoneInfo(os.getenv("ATLASYN_TIMEZONE", "Africa/Tunis"))
COOKIE_SECURE = os.getenv("ATLASYN_COOKIE_SECURE", "0") == "1"
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ATLASYN_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
ADMIN_EMAIL = os.getenv("ATLASYN_ADMIN_EMAIL", "ceo@atlasyn.com").lower()
ADMIN_NAME = os.getenv("ATLASYN_ADMIN_NAME", "Montassar Bali")
TURN_URL = os.getenv("ATLASYN_TURN_URL", "")
TURN_USERNAME = os.getenv("ATLASYN_TURN_USERNAME", "")
TURN_CREDENTIAL = os.getenv("ATLASYN_TURN_CREDENTIAL", "")

SESSION_COOKIE = "atlasyn_session"
SESSION_TTL = timedelta(hours=12)
HEARTBEAT_MAX_GAP = timedelta(minutes=6)  # longest gap between heartbeats still counted as worked time
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_FAILURES = 5
MAX_ROOM_SIZE = 8
INITIAL_PASSWORD_FILE = DB_PATH.parent / ".admin-initial-password"

if OFFICE_NETWORKS and all(net.is_loopback for net in OFFICE_NETWORKS):
    logger.warning("ATLASYN_OFFICE_NETWORKS is not set: only this machine counts as 'on site' (development mode).")


# ── Schema ───────────────────────────────────────────────────────────────────

def init_workforce_db() -> None:
    conn = get_db()
    with conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                role TEXT NOT NULL CHECK (role IN ('admin', 'employee')),
                password_hash TEXT NOT NULL,
                must_change_password INTEGER NOT NULL DEFAULT 1,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                ip TEXT NOT NULL,
                user_agent TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS attendance_days (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                day TEXT NOT NULL,
                check_in_at TEXT NOT NULL,
                check_in_ip TEXT NOT NULL,
                check_out_at TEXT,
                check_out_ip TEXT,
                last_seen_at TEXT NOT NULL,
                verified_seconds INTEGER NOT NULL DEFAULT 0,
                UNIQUE (user_id, day)
            );
            CREATE TABLE IF NOT EXISTS attendance_events (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                day TEXT NOT NULL,
                kind TEXT NOT NULL,
                at TEXT NOT NULL,
                ip TEXT NOT NULL,
                on_site INTEGER NOT NULL,
                accepted INTEGER NOT NULL,
                reason TEXT NOT NULL DEFAULT '',
                user_agent TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS meetings (
                code TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                host_id TEXT NOT NULL REFERENCES users(id),
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_events_user_day ON attendance_events(user_id, day);
            CREATE INDEX IF NOT EXISTS idx_days_day ON attendance_days(day);
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        """)
        has_users = conn.execute("SELECT 1 FROM users LIMIT 1").fetchone()
        if not has_users:
            password = secrets.token_urlsafe(12)
            conn.execute(
                "INSERT INTO users (id, email, name, title, role, password_hash, must_change_password, created_at) VALUES (?, ?, ?, ?, 'admin', ?, 1, ?)",
                (_new_id("usr"), ADMIN_EMAIL, ADMIN_NAME, "Chief Executive Officer", hash_password(password), _now_iso()),
            )
            # Written to an owner-only file instead of the log so the secret never lands in log aggregation.
            INITIAL_PASSWORD_FILE.write_text(f"{ADMIN_EMAIL}\n{password}\n")
            os.chmod(INITIAL_PASSWORD_FILE, 0o600)
            logger.warning("Created first admin account %s. Its one-time password is in %s (change it at first sign-in, then delete the file).", ADMIN_EMAIL, INITIAL_PASSWORD_FILE)
    conn.close()


# ── Helpers ──────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def _today() -> str:
    return _now().astimezone(COMPANY_TZ).date().isoformat()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=64)
    return f"scrypt$16384$8$1${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, n, r, p, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=int(n), r=int(r), p=int(p), dklen=len(digest_hex) // 2)
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


# Used for unknown emails so a login attempt costs the same either way (no account enumeration by timing).
_DUMMY_HASH = hash_password(secrets.token_hex(16))


def client_ip(host: Optional[str], headers: Any) -> str:
    """The caller's address. X-Forwarded-For is only honoured when the socket peer is a trusted proxy."""
    peer = host or "0.0.0.0"
    try:
        peer_addr = ipaddress.ip_address(peer)
    except ValueError:
        return peer
    if not any(peer_addr in net for net in TRUSTED_PROXIES):
        return peer
    forwarded = [item.strip() for item in (headers.get("x-forwarded-for") or "").split(",") if item.strip()]
    # Walk from the right: the first address not belonging to our own proxies is the real client.
    for candidate in reversed(forwarded):
        try:
            addr = ipaddress.ip_address(candidate)
        except ValueError:
            return peer
        if not any(addr in net for net in TRUSTED_PROXIES):
            return candidate
    return peer


def is_on_site(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in net for net in OFFICE_NETWORKS)


def _public_user(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "name": row["name"],
        "title": row["title"],
        "role": row["role"],
        "must_change_password": bool(row["must_change_password"]),
        "active": bool(row["active"]),
        "initials": "".join(part[0] for part in row["name"].split()[:2]).upper(),
    }


def _validate_password(password: str) -> None:
    if len(password) < 10:
        raise HTTPException(400, "Use at least 10 characters.")
    if password.lower() == password or not any(ch.isdigit() for ch in password):
        raise HTTPException(400, "Mix upper and lower case letters and at least one number.")


# ── Auth dependencies ────────────────────────────────────────────────────────

def _user_from_token(token: Optional[str]) -> Optional[sqlite3.Row]:
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    conn = get_db()
    row = conn.execute(
        """SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1""",
        (token_hash, _now_iso()),
    ).fetchone()
    conn.close()
    return row


def require_csrf(request: Request) -> None:
    """State-changing requests must carry a custom header, which cross-site forms and simple fetches cannot send."""
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get("x-requested-with") != "atlasyn":
        raise HTTPException(403, "Missing request header.")


def current_user(request: Request) -> sqlite3.Row:
    require_csrf(request)
    user = _user_from_token(request.cookies.get(SESSION_COOKIE))
    if not user:
        raise HTTPException(401, "Please sign in.")
    return user


def active_user(user: sqlite3.Row = Depends(current_user)) -> sqlite3.Row:
    if user["must_change_password"]:
        raise HTTPException(403, "Change your temporary password first.")
    return user


def admin_user(user: sqlite3.Row = Depends(active_user)) -> sqlite3.Row:
    if user["role"] != "admin":
        raise HTTPException(403, "Admins only.")
    return user


# ── Auth endpoints ───────────────────────────────────────────────────────────

_failures: Dict[str, List[float]] = {}


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=200)
    password: str = Field(..., min_length=1, max_length=200)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., max_length=200)
    new_password: str = Field(..., max_length=200)


@router.post("/auth/login")
async def login(req: LoginRequest, request: Request, response: Response):
    require_csrf(request)
    ip = client_ip(request.client.host if request.client else None, request.headers)
    email = req.email.strip().lower()
    key = f"{ip}|{email}"
    window_start = time.monotonic() - LOGIN_WINDOW_SECONDS
    recent = [t for t in _failures.get(key, []) if t > window_start]
    if len(recent) >= LOGIN_MAX_FAILURES:
        raise HTTPException(429, "Too many attempts. Try again in 15 minutes.")

    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE email = ? AND active = 1", (email,)).fetchone()
    ok = verify_password(req.password, row["password_hash"] if row else _DUMMY_HASH) and row is not None
    if not ok:
        conn.close()
        _failures[key] = recent + [time.monotonic()]
        raise HTTPException(401, "Email or password is incorrect.")
    _failures.pop(key, None)

    token = secrets.token_urlsafe(32)
    with conn:
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (_now_iso(),))
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)",
            (hashlib.sha256(token.encode()).hexdigest(), row["id"], _now_iso(), (_now() + SESSION_TTL).isoformat(), ip, request.headers.get("user-agent", "")[:300]),
        )
    conn.close()
    response.set_cookie(SESSION_COOKIE, token, max_age=int(SESSION_TTL.total_seconds()), httponly=True, secure=COOKIE_SECURE, samesite="strict", path="/")
    return {"user": _public_user(row)}


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    require_csrf(request)
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        conn = get_db()
        with conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (hashlib.sha256(token.encode()).hexdigest(),))
        conn.close()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"status": "signed_out"}


@router.get("/auth/me")
async def me(user: sqlite3.Row = Depends(current_user)):
    return {"user": _public_user(user)}


@router.post("/auth/change-password")
async def change_password(req: ChangePasswordRequest, request: Request, response: Response, user: sqlite3.Row = Depends(current_user)):
    if not verify_password(req.current_password, user["password_hash"]):
        raise HTTPException(400, "Current password is incorrect.")
    if req.new_password == req.current_password:
        raise HTTPException(400, "Choose a password different from the current one.")
    _validate_password(req.new_password)
    conn = get_db()
    with conn:
        conn.execute("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?", (hash_password(req.new_password), user["id"]))
        # Sign out every other session for this account.
        current_hash = hashlib.sha256((request.cookies.get(SESSION_COOKIE) or "").encode()).hexdigest()
        conn.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", (user["id"], current_hash))
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    conn.close()
    if user["role"] == "admin" and INITIAL_PASSWORD_FILE.exists():
        INITIAL_PASSWORD_FILE.unlink()
    return {"user": _public_user(row)}


# ── Admin: people ────────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    email: str = Field(..., min_length=5, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    title: str = Field("", max_length=80)
    role: str = Field("employee", pattern=r"^(admin|employee)$")


class UpdateUserRequest(BaseModel):
    active: Optional[bool] = None
    reset_password: Optional[bool] = None


@router.get("/admin/users")
async def list_users(_: sqlite3.Row = Depends(admin_user)):
    conn = get_db()
    rows = conn.execute("SELECT * FROM users ORDER BY role, name").fetchall()
    conn.close()
    return {"users": [_public_user(r) for r in rows]}


@router.post("/admin/users")
async def create_user(req: CreateUserRequest, _: sqlite3.Row = Depends(admin_user)):
    temp = secrets.token_urlsafe(9)
    conn = get_db()
    try:
        with conn:
            user_id = _new_id("usr")
            conn.execute(
                "INSERT INTO users (id, email, name, title, role, password_hash, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
                (user_id, req.email.strip().lower(), req.name.strip(), req.title.strip(), req.role, hash_password(temp), _now_iso()),
            )
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    except sqlite3.IntegrityError:
        raise HTTPException(409, "An account with this email already exists.")
    finally:
        conn.close()
    # The temporary password is returned exactly once so the admin can hand it over; it is never stored in clear.
    return {"user": _public_user(row), "temporary_password": temp}


@router.patch("/admin/users/{user_id}")
async def update_user(user_id: str, req: UpdateUserRequest, admin: sqlite3.Row = Depends(admin_user)):
    if user_id == admin["id"] and req.active is False:
        raise HTTPException(400, "You cannot deactivate your own account.")
    conn = get_db()
    temp = None
    if not conn.execute("SELECT 1 FROM users WHERE id = ?", (user_id,)).fetchone():
        conn.close()
        raise HTTPException(404, "User not found.")
    with conn:
        if req.active is not None:
            conn.execute("UPDATE users SET active = ? WHERE id = ?", (1 if req.active else 0, user_id))
            if not req.active:
                conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        if req.reset_password:
            temp = secrets.token_urlsafe(9)
            conn.execute("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?", (hash_password(temp), user_id))
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return {"user": _public_user(row), "temporary_password": temp}


# ── Attendance ───────────────────────────────────────────────────────────────

def _record_event(conn: sqlite3.Connection, user_id: str, kind: str, ip: str, on_site: bool, accepted: bool, reason: str, ua: str) -> None:
    conn.execute(
        "INSERT INTO attendance_events (id, user_id, day, kind, at, ip, on_site, accepted, reason, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (_new_id("evt"), user_id, _today(), kind, _now_iso(), ip, int(on_site), int(accepted), reason, ua[:300]),
    )


def _day_row(conn: sqlite3.Connection, user_id: str, day: str) -> Optional[sqlite3.Row]:
    return conn.execute("SELECT * FROM attendance_days WHERE user_id = ? AND day = ?", (user_id, day)).fetchone()


def _day_public(row: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    if not row:
        return None
    return {
        "day": row["day"],
        "check_in_at": row["check_in_at"],
        "check_out_at": row["check_out_at"],
        "last_seen_at": row["last_seen_at"],
        "verified_minutes": row["verified_seconds"] // 60,
        "status": "checked_out" if row["check_out_at"] else "checked_in",
    }


def _accrue(conn: sqlite3.Connection, row: sqlite3.Row) -> None:
    """Credit time since the last on-site signal, capped so time away from the office is never counted."""
    last = datetime.fromisoformat(row["last_seen_at"])
    gap = min(_now() - last, HEARTBEAT_MAX_GAP)
    conn.execute(
        "UPDATE attendance_days SET verified_seconds = verified_seconds + ?, last_seen_at = ? WHERE id = ?",
        (max(0, int(gap.total_seconds())), _now_iso(), row["id"]),
    )


def _status_payload(conn: sqlite3.Connection, user: sqlite3.Row, ip: str) -> Dict[str, Any]:
    day = _today()
    events = conn.execute(
        "SELECT kind, at, on_site, accepted, reason FROM attendance_events WHERE user_id = ? AND day = ? AND kind != 'heartbeat' ORDER BY at",
        (user["id"], day),
    ).fetchall()
    history = conn.execute(
        "SELECT * FROM attendance_days WHERE user_id = ? ORDER BY day DESC LIMIT 14", (user["id"],)
    ).fetchall()
    return {
        "on_site": is_on_site(ip),
        "network_label": OFFICE_LABEL if is_on_site(ip) else "Outside the office network",
        "ip": ip,
        "today": _day_public(_day_row(conn, user["id"], day)),
        "events": [dict(e) | {"on_site": bool(e["on_site"]), "accepted": bool(e["accepted"])} for e in events],
        "history": [_day_public(h) for h in history],
        "heartbeat_seconds": 60,
    }


def _ip(request: Request) -> str:
    return client_ip(request.client.host if request.client else None, request.headers)


@router.get("/attendance/status")
async def attendance_status(request: Request, user: sqlite3.Row = Depends(active_user)):
    conn = get_db()
    payload = _status_payload(conn, user, _ip(request))
    conn.close()
    return payload


@router.post("/attendance/check-in")
async def check_in(request: Request, user: sqlite3.Row = Depends(active_user)):
    ip, ua = _ip(request), request.headers.get("user-agent", "")
    on_site = is_on_site(ip)
    conn = get_db()
    if not on_site:
        # The refused attempt is committed before raising so admins can audit off-site check-in attempts.
        with conn:
            _record_event(conn, user["id"], "check_in", ip, False, False, "Request did not come from the office network", ua)
        conn.close()
        raise HTTPException(403, "Check-in refused: you're not connected to the office network.")
    day = _today()
    existing = _day_row(conn, user["id"], day)
    if existing and not existing["check_out_at"]:
        conn.close()
        raise HTTPException(409, "You're already checked in.")
    with conn:
        if existing:
            # Returning after checking out: resume the same day without crediting the time away.
            conn.execute("UPDATE attendance_days SET check_out_at = NULL, check_out_ip = NULL, last_seen_at = ? WHERE id = ?", (_now_iso(), existing["id"]))
        else:
            conn.execute(
                "INSERT INTO attendance_days (id, user_id, day, check_in_at, check_in_ip, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)",
                (_new_id("day"), user["id"], day, _now_iso(), ip, _now_iso()),
            )
        _record_event(conn, user["id"], "check_in", ip, True, True, "", ua)
        payload = _status_payload(conn, user, ip)
    conn.close()
    return payload


@router.post("/attendance/heartbeat")
async def heartbeat(request: Request, user: sqlite3.Row = Depends(active_user)):
    ip, ua = _ip(request), request.headers.get("user-agent", "")
    on_site = is_on_site(ip)
    conn = get_db()
    with conn:
        row = _day_row(conn, user["id"], _today())
        if row and not row["check_out_at"]:
            if on_site:
                _accrue(conn, row)
            else:
                # Off-site: stop the clock here, so the next on-site heartbeat cannot credit the time away.
                conn.execute("UPDATE attendance_days SET last_seen_at = ? WHERE id = ?", (_now_iso(), row["id"]))
            _record_event(conn, user["id"], "heartbeat", ip, on_site, on_site, "" if on_site else "Off the office network", ua)
        row = _day_row(conn, user["id"], _today())
    conn.close()
    return {"on_site": on_site, "today": _day_public(row)}


@router.post("/attendance/check-out")
async def check_out(request: Request, user: sqlite3.Row = Depends(active_user)):
    ip, ua = _ip(request), request.headers.get("user-agent", "")
    on_site = is_on_site(ip)
    conn = get_db()
    row = _day_row(conn, user["id"], _today())
    if not row or row["check_out_at"]:
        conn.close()
        raise HTTPException(409, "You're not checked in.")
    with conn:
        if on_site:
            _accrue(conn, row)
        conn.execute("UPDATE attendance_days SET check_out_at = ?, check_out_ip = ? WHERE id = ?", (_now_iso(), ip, row["id"]))
        _record_event(conn, user["id"], "check_out", ip, on_site, True, "" if on_site else "Checked out off-site; time after leaving was not counted", ua)
        payload = _status_payload(conn, user, ip)
    conn.close()
    return payload


@router.get("/admin/attendance")
async def admin_attendance(day: Optional[str] = None, _: sqlite3.Row = Depends(admin_user)):
    day = day or _today()
    try:
        datetime.strptime(day, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Use YYYY-MM-DD.")
    conn = get_db()
    users = conn.execute("SELECT * FROM users WHERE active = 1 ORDER BY name").fetchall()
    result = []
    for u in users:
        record = _day_row(conn, u["id"], day)
        rejected = conn.execute(
            "SELECT COUNT(*) FROM attendance_events WHERE user_id = ? AND day = ? AND accepted = 0 AND kind != 'heartbeat'", (u["id"], day)
        ).fetchone()[0]
        offsite_beats = conn.execute(
            "SELECT COUNT(*) FROM attendance_events WHERE user_id = ? AND day = ? AND kind = 'heartbeat' AND on_site = 0", (u["id"], day)
        ).fetchone()[0]
        result.append({"user": _public_user(u), "record": _day_public(record), "rejected_attempts": rejected, "offsite_signals": offsite_beats})
    conn.close()
    return {"day": day, "office": OFFICE_LABEL, "people": result}


# ── Meetings ─────────────────────────────────────────────────────────────────

class CreateMeetingRequest(BaseModel):
    title: str = Field("Team sync", min_length=1, max_length=80)


def _meeting_code() -> str:
    alphabet = "abcdefghijkmnpqrstuvwxyz"
    part = lambda n: "".join(secrets.choice(alphabet) for _ in range(n))  # noqa: E731
    return f"{part(3)}-{part(4)}-{part(3)}"


class Room:
    def __init__(self) -> None:
        self.peers: Dict[str, Dict[str, Any]] = {}
        self.started_at = _now_iso()

    async def broadcast(self, message: Dict[str, Any], exclude: Optional[str] = None) -> None:
        for peer_id, peer in list(self.peers.items()):
            if peer_id == exclude:
                continue
            try:
                await peer["ws"].send_json(message)
            except Exception:  # a dead socket is cleaned up by its own handler
                pass


rooms: Dict[str, Room] = {}
rooms_lock = asyncio.Lock()


def _peer_public(peer_id: str, peer: Dict[str, Any]) -> Dict[str, Any]:
    return {"id": peer_id, "name": peer["user"]["name"], "initials": peer["user"]["initials"], "role": peer["user"]["role"], "title": peer["user"]["title"], "state": peer["state"]}


@router.post("/meetings")
async def create_meeting(req: CreateMeetingRequest, user: sqlite3.Row = Depends(active_user)):
    conn = get_db()
    with conn:
        code = _meeting_code()
        conn.execute("INSERT INTO meetings (code, title, host_id, created_at) VALUES (?, ?, ?, ?)", (code, req.title.strip(), user["id"], _now_iso()))
    conn.close()
    return {"code": code, "title": req.title.strip()}


@router.get("/meetings")
async def list_meetings(_: sqlite3.Row = Depends(active_user)):
    conn = get_db()
    rows = conn.execute(
        "SELECT m.*, u.name AS host_name FROM meetings m JOIN users u ON u.id = m.host_id ORDER BY m.created_at DESC LIMIT 20"
    ).fetchall()
    conn.close()
    return {"meetings": [
        {
            "code": r["code"], "title": r["title"], "host": r["host_name"], "created_at": r["created_at"],
            "participants": [_peer_public(pid, p) for pid, p in rooms[r["code"]].peers.items()] if r["code"] in rooms else [],
        } for r in rows
    ]}


@router.get("/meetings/ice-config")
async def ice_config(_: sqlite3.Row = Depends(active_user)):
    servers: List[Dict[str, Any]] = [{"urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]}]
    if TURN_URL:
        servers.append({"urls": TURN_URL, "username": TURN_USERNAME, "credential": TURN_CREDENTIAL})
    return {"iceServers": servers}


@router.get("/meetings/{code}")
async def get_meeting(code: str, _: sqlite3.Row = Depends(active_user)):
    conn = get_db()
    row = conn.execute("SELECT m.*, u.name AS host_name FROM meetings m JOIN users u ON u.id = m.host_id WHERE code = ?", (code,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "No meeting with that code.")
    room = rooms.get(code)
    return {"code": code, "title": row["title"], "host": row["host_name"], "participants": len(room.peers) if room else 0}


ALLOWED_REACTIONS = {"👍", "👏", "🎉", "❤️", "😂", "😮"}


@router.websocket("/meetings/{code}/ws")
async def meeting_socket(websocket: WebSocket, code: str):
    # Browsers always send Origin on websockets; refusing foreign origins blocks cross-site socket hijacking.
    if websocket.headers.get("origin") not in ALLOWED_ORIGINS:
        await websocket.close(code=4403)
        return
    user_row = _user_from_token(websocket.cookies.get(SESSION_COOKIE))
    if not user_row or user_row["must_change_password"]:
        await websocket.close(code=4401)
        return
    conn = get_db()
    meeting = conn.execute("SELECT title FROM meetings WHERE code = ?", (code,)).fetchone()
    conn.close()
    if not meeting:
        await websocket.close(code=4404)
        return

    user = _public_user(user_row)
    peer_id = _new_id("peer")
    async with rooms_lock:
        room = rooms.setdefault(code, Room())
        if len(room.peers) >= MAX_ROOM_SIZE:
            await websocket.close(code=4429)
            return
        await websocket.accept()
        state = {"mic": True, "cam": True, "screen": False, "hand": False}
        others = [_peer_public(pid, p) for pid, p in room.peers.items()]
        room.peers[peer_id] = {"ws": websocket, "user": user, "state": state}

    await websocket.send_json({"type": "welcome", "self": peer_id, "peers": others, "title": meeting["title"], "started_at": room.started_at})
    await room.broadcast({"type": "peer-joined", "peer": _peer_public(peer_id, room.peers[peer_id])}, exclude=peer_id)

    try:
        while True:
            raw = await websocket.receive_text()
            if len(raw) > 64_000:
                continue
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            kind = msg.get("type")
            if kind == "signal":
                target = room.peers.get(str(msg.get("to")))
                if target:
                    await target["ws"].send_json({"type": "signal", "from": peer_id, "data": msg.get("data")})
            elif kind == "state":
                incoming = msg.get("state") or {}
                for key in ("mic", "cam", "screen", "hand"):
                    if isinstance(incoming.get(key), bool):
                        room.peers[peer_id]["state"][key] = incoming[key]
                await room.broadcast({"type": "peer-state", "id": peer_id, "state": room.peers[peer_id]["state"]})
            elif kind == "chat":
                text = str(msg.get("text", "")).strip()[:1000]
                if text:
                    await room.broadcast({"type": "chat", "id": _new_id("msg"), "from": peer_id, "name": user["name"], "text": text, "at": _now_iso()})
            elif kind == "reaction" and msg.get("emoji") in ALLOWED_REACTIONS:
                await room.broadcast({"type": "reaction", "from": peer_id, "name": user["name"], "emoji": msg["emoji"]})
    except WebSocketDisconnect:
        pass
    finally:
        async with rooms_lock:
            room.peers.pop(peer_id, None)
            if not room.peers:
                rooms.pop(code, None)
        await room.broadcast({"type": "peer-left", "id": peer_id})
