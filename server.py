"""
FastAPI backend for Panini Sticker Tracker.
Run with: uvicorn server:app --reload --port 8000
"""

import os
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional

import psycopg2
import psycopg2.extras
import psycopg2.errors
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from ocr import scan_image
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr

# ── Config ────────────────────────────────────────────────────────────────────

DATABASE_URL = os.getenv("DATABASE_URL")
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 72

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer()

app = FastAPI(title="Panini Tracker API")
_cors_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── DB helpers ────────────────────────────────────────────────────────────────

def _pg_connect():
    import urllib.parse
    r = urllib.parse.urlparse(DATABASE_URL)
    return psycopg2.connect(
        host=r.hostname,
        port=r.port or 5432,
        dbname=r.path.lstrip("/"),
        user=r.username,
        password=r.password,
        sslmode="require",
    )

@contextmanager
def get_db():
    conn = _pg_connect()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            yield cur
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ── Auth helpers ──────────────────────────────────────────────────────────────

def hash_password(pw: str) -> str:
    return pwd_ctx.hash(pw)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


def create_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": str(user_id), "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    with get_db() as db:
        db.execute("SELECT id, username, email, country FROM users WHERE id = %s", (user_id,))
        row = db.fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    return dict(row)


# ── Schemas ───────────────────────────────────────────────────────────────────

class SignupBody(BaseModel):
    username: str
    email: EmailStr
    password: str
    country: Optional[str] = None

class LoginBody(BaseModel):
    username: str
    password: str

class AddStickerBody(BaseModel):
    sticker_id: int

class UpdateQtyBody(BaseModel):
    quantity: int

class FriendRequestBody(BaseModel):
    user_id: int

class RespondFriendBody(BaseModel):
    accept: bool

class SwapStatusBody(BaseModel):
    status: str

class WantedBody(BaseModel):
    sticker_id: int

class SwapItem(BaseModel):
    offered_sticker_id: int
    wanted_sticker_id: int

class SwapCreateBody(BaseModel):
    receiver_id: int
    items: list[SwapItem]


# ── Auth routes ───────────────────────────────────────────────────────────────

@app.post("/api/auth/signup")
def signup(body: SignupBody):
    with get_db() as db:
        db.execute("SELECT 1 FROM users WHERE username = %s", (body.username,))
        if db.fetchone():
            raise HTTPException(400, "Username already taken")
        db.execute("SELECT 1 FROM users WHERE email = %s", (body.email,))
        if db.fetchone():
            raise HTTPException(400, "Email already registered")
        db.execute(
            "INSERT INTO users (username, email, password_hash, country) VALUES (%s,%s,%s,%s) RETURNING id",
            (body.username, body.email, hash_password(body.password), body.country),
        )
        user_id = db.fetchone()["id"]
    user = {"id": user_id, "username": body.username, "email": body.email, "country": body.country}
    return {"token": create_token(user_id), "user": user}


@app.post("/api/auth/login")
def login(body: LoginBody):
    with get_db() as db:
        db.execute(
            "SELECT id, username, email, country, password_hash FROM users WHERE username = %s",
            (body.username,),
        )
        row = db.fetchone()
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(401, "Invalid username or password")
    user = {"id": row["id"], "username": row["username"], "email": row["email"], "country": row["country"]}
    return {"token": create_token(row["id"]), "user": user}


# ── Sticker catalogue ─────────────────────────────────────────────────────────

@app.get("/api/stickers")
def list_stickers(me=Depends(get_current_user)):
    with get_db() as db:
        db.execute(
            "SELECT id, sticker_code, team_name, player_name, sticker_type, club "
            "FROM stickers ORDER BY team_name, sticker_num"
        )
        rows = db.fetchall()
    return [dict(r) for r in rows]


@app.get("/api/stickers/lookup")
def lookup_sticker(code: str, me=Depends(get_current_user)):
    normalized = code.strip().upper()
    with get_db() as db:
        db.execute(
            "SELECT id, sticker_code, team_name, player_name, sticker_type, club "
            "FROM stickers WHERE sticker_code = %s",
            (normalized,),
        )
        row = db.fetchone()
    if not row:
        raise HTTPException(404, "Sticker not found")
    return dict(row)


# ── User sticker list (duplicates) ────────────────────────────────────────────

def _sticker_entry(row):
    return {
        "id": row["id"],
        "quantity": row["quantity"],
        "sticker": {
            "id": row["sticker_id"],
            "sticker_code": row["sticker_code"],
            "team_name": row["team_name"],
            "player_name": row["player_name"],
            "sticker_type": row["sticker_type"],
            "club": row["club"],
        },
    }

LIST_QUERY = """
    SELECT us.id, us.quantity, us.sticker_id,
           s.sticker_code, s.team_name, s.player_name, s.sticker_type, s.club
    FROM user_stickers us
    JOIN stickers s ON s.id = us.sticker_id
    WHERE us.user_id = %s
    ORDER BY s.team_name, s.sticker_num
"""

LIST_BY_ID_QUERY = """
    SELECT us.id, us.quantity, us.sticker_id,
           s.sticker_code, s.team_name, s.player_name, s.sticker_type, s.club
    FROM user_stickers us
    JOIN stickers s ON s.id = us.sticker_id
    WHERE us.user_id = %s AND us.id = %s
"""


@app.get("/api/stickers/list")
def get_my_list(me=Depends(get_current_user)):
    with get_db() as db:
        db.execute(LIST_QUERY, (me["id"],))
        rows = db.fetchall()
    return [_sticker_entry(r) for r in rows]


@app.post("/api/stickers/list", status_code=201)
def add_to_list(body: AddStickerBody, me=Depends(get_current_user)):
    with get_db() as db:
        db.execute("SELECT 1 FROM stickers WHERE id = %s", (body.sticker_id,))
        if not db.fetchone():
            raise HTTPException(404, "Sticker not found")
        db.execute(
            "SELECT id, quantity FROM user_stickers WHERE user_id = %s AND sticker_id = %s",
            (me["id"], body.sticker_id),
        )
        existing = db.fetchone()
        if existing:
            new_qty = existing["quantity"] + 1
            db.execute(
                "UPDATE user_stickers SET quantity = %s, updated_at = NOW() WHERE id = %s",
                (new_qty, existing["id"]),
            )
            entry_id = existing["id"]
        else:
            db.execute(
                "INSERT INTO user_stickers (user_id, sticker_id, quantity) VALUES (%s,%s,1) RETURNING id",
                (me["id"], body.sticker_id),
            )
            entry_id = db.fetchone()["id"]
        db.execute(LIST_BY_ID_QUERY, (me["id"], entry_id))
        row = db.fetchone()
    return _sticker_entry(row)


@app.patch("/api/stickers/list/{entry_id}")
def update_qty(entry_id: int, body: UpdateQtyBody, me=Depends(get_current_user)):
    if body.quantity < 1:
        raise HTTPException(400, "Quantity must be at least 1")
    with get_db() as db:
        db.execute(
            "SELECT id FROM user_stickers WHERE id = %s AND user_id = %s", (entry_id, me["id"])
        )
        if not db.fetchone():
            raise HTTPException(404, "Entry not found")
        db.execute(
            "UPDATE user_stickers SET quantity = %s, updated_at = NOW() WHERE id = %s",
            (body.quantity, entry_id),
        )
    return {"ok": True}


@app.delete("/api/stickers/list/{entry_id}", status_code=204)
def remove_from_list(entry_id: int, me=Depends(get_current_user)):
    with get_db() as db:
        db.execute(
            "SELECT id FROM user_stickers WHERE id = %s AND user_id = %s", (entry_id, me["id"])
        )
        if not db.fetchone():
            raise HTTPException(404, "Entry not found")
        db.execute("DELETE FROM user_stickers WHERE id = %s", (entry_id,))


# ── Users ─────────────────────────────────────────────────────────────────────

@app.get("/api/users/search")
def search_user(username: str, me=Depends(get_current_user)):
    with get_db() as db:
        db.execute(
            "SELECT id, username, country FROM users WHERE username = %s AND id != %s",
            (username, me["id"]),
        )
        row = db.fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    return dict(row)


# ── Friends ───────────────────────────────────────────────────────────────────

@app.get("/api/friends")
def get_friends(me=Depends(get_current_user)):
    with get_db() as db:
        db.execute("""
            SELECT u.id, u.username, u.country,
                   (SELECT COUNT(*) FROM user_stickers us WHERE us.user_id = u.id) AS duplicate_count
            FROM friendships f
            JOIN users u ON u.id = CASE WHEN f.requester_id = %s THEN f.receiver_id ELSE f.requester_id END
            WHERE (f.requester_id = %s OR f.receiver_id = %s) AND f.status = 'accepted'
        """, (me["id"], me["id"], me["id"]))
        rows = db.fetchall()
    return [dict(r) for r in rows]


@app.get("/api/friends/requests")
def get_friend_requests(me=Depends(get_current_user)):
    with get_db() as db:
        db.execute("""
            SELECT f.id, f.created_at,
                   u.id as req_id, u.username as req_username, u.country as req_country
            FROM friendships f
            JOIN users u ON u.id = f.requester_id
            WHERE f.receiver_id = %s AND f.status = 'pending'
        """, (me["id"],))
        rows = db.fetchall()
    return [
        {
            "id": r["id"],
            "created_at": r["created_at"],
            "requester": {"id": r["req_id"], "username": r["req_username"], "country": r["req_country"]},
        }
        for r in rows
    ]


@app.post("/api/friends/request", status_code=201)
def send_friend_request(body: FriendRequestBody, me=Depends(get_current_user)):
    if body.user_id == me["id"]:
        raise HTTPException(400, "Cannot add yourself")
    with get_db() as db:
        db.execute("SELECT 1 FROM users WHERE id = %s", (body.user_id,))
        if not db.fetchone():
            raise HTTPException(404, "User not found")
        db.execute("""
            SELECT 1 FROM friendships
            WHERE (requester_id = %s AND receiver_id = %s) OR (requester_id = %s AND receiver_id = %s)
        """, (me["id"], body.user_id, body.user_id, me["id"]))
        if db.fetchone():
            raise HTTPException(409, "Friend request already exists")
        db.execute(
            "INSERT INTO friendships (requester_id, receiver_id) VALUES (%s, %s)",
            (me["id"], body.user_id),
        )
    return {"ok": True}


@app.patch("/api/friends/request/{friendship_id}")
def respond_friend_request(friendship_id: int, body: RespondFriendBody, me=Depends(get_current_user)):
    with get_db() as db:
        db.execute(
            "SELECT id FROM friendships WHERE id = %s AND receiver_id = %s AND status = 'pending'",
            (friendship_id, me["id"]),
        )
        if not db.fetchone():
            raise HTTPException(404, "Request not found")
        new_status = "accepted" if body.accept else "rejected"
        db.execute(
            "UPDATE friendships SET status = %s, updated_at = NOW() WHERE id = %s",
            (new_status, friendship_id),
        )
    return {"ok": True}


# ── Wanted / Wishlist ─────────────────────────────────────────────────────────

WANTED_QUERY = """
    SELECT uw.id, s.id as sticker_id, s.sticker_code, s.team_name,
           s.player_name, s.sticker_type, s.club
    FROM user_wanted_stickers uw
    JOIN stickers s ON s.id = uw.sticker_id
    WHERE uw.user_id = %s
    ORDER BY s.team_name, s.sticker_num
"""

WANTED_BY_ID_QUERY = """
    SELECT uw.id, s.id as sticker_id, s.sticker_code, s.team_name,
           s.player_name, s.sticker_type, s.club
    FROM user_wanted_stickers uw
    JOIN stickers s ON s.id = uw.sticker_id
    WHERE uw.user_id = %s AND uw.id = %s
"""

def _wanted_entry(r):
    return {
        "id": r["id"],
        "sticker": {
            "id": r["sticker_id"], "sticker_code": r["sticker_code"],
            "team_name": r["team_name"], "player_name": r["player_name"],
            "sticker_type": r["sticker_type"], "club": r["club"],
        },
    }


@app.get("/api/stickers/wanted")
def get_wanted(me=Depends(get_current_user)):
    with get_db() as db:
        db.execute(WANTED_QUERY, (me["id"],))
        rows = db.fetchall()
    return [_wanted_entry(r) for r in rows]


@app.post("/api/stickers/wanted", status_code=201)
def add_wanted(body: WantedBody, me=Depends(get_current_user)):
    with get_db() as db:
        db.execute("SELECT 1 FROM stickers WHERE id = %s", (body.sticker_id,))
        if not db.fetchone():
            raise HTTPException(404, "Sticker not found")
        try:
            db.execute(
                "INSERT INTO user_wanted_stickers (user_id, sticker_id) VALUES (%s, %s) RETURNING id",
                (me["id"], body.sticker_id),
            )
            entry_id = db.fetchone()["id"]
            db.execute(WANTED_BY_ID_QUERY, (me["id"], entry_id))
            row = db.fetchone()
        except psycopg2.errors.UniqueViolation:
            raise HTTPException(409, "Already in wanted list")
    return _wanted_entry(row)


@app.delete("/api/stickers/wanted/{entry_id}", status_code=204)
def remove_wanted(entry_id: int, me=Depends(get_current_user)):
    with get_db() as db:
        db.execute(
            "SELECT 1 FROM user_wanted_stickers WHERE id = %s AND user_id = %s", (entry_id, me["id"])
        )
        if not db.fetchone():
            raise HTTPException(404, "Entry not found")
        db.execute("DELETE FROM user_wanted_stickers WHERE id = %s", (entry_id,))


# ── Friend stickers ───────────────────────────────────────────────────────────

@app.get("/api/friends/{friend_id}/stickers")
def get_friend_stickers(friend_id: int, me=Depends(get_current_user)):
    with get_db() as db:
        db.execute("""
            SELECT 1 FROM friendships
            WHERE ((requester_id = %s AND receiver_id = %s) OR (requester_id = %s AND receiver_id = %s))
              AND status = 'accepted'
        """, (me["id"], friend_id, friend_id, me["id"]))
        if not db.fetchone():
            raise HTTPException(403, "Not friends with this user")
        db.execute(LIST_QUERY, (friend_id,))
        rows = db.fetchall()
        db.execute(
            "SELECT sticker_id FROM user_wanted_stickers WHERE user_id = %s", (me["id"],)
        )
        wanted_ids = {r["sticker_id"] for r in db.fetchall()}
    entries = [_sticker_entry(r) for r in rows]
    for e in entries:
        e["i_want"] = e["sticker"]["id"] in wanted_ids
    return entries


# ── Swaps ─────────────────────────────────────────────────────────────────────

SWAP_LIST_QUERY = """
    SELECT sr.id, sr.offerer_id, sr.receiver_id, sr.status, sr.created_at,
           o.id as o_id, o.username as o_username,
           r.id as r_id, r.username as r_username
    FROM swap_requests sr
    JOIN users o ON o.id = sr.offerer_id
    JOIN users r ON r.id = sr.receiver_id
    WHERE sr.offerer_id = %s OR sr.receiver_id = %s
    ORDER BY sr.created_at DESC
"""

SWAP_ONE_QUERY = """
    SELECT sr.id, sr.offerer_id, sr.receiver_id, sr.status, sr.created_at,
           o.id as o_id, o.username as o_username,
           r.id as r_id, r.username as r_username
    FROM swap_requests sr
    JOIN users o ON o.id = sr.offerer_id
    JOIN users r ON r.id = sr.receiver_id
    WHERE sr.id = %s
"""

SWAP_ITEMS_QUERY = """
    SELECT si.id,
           os.id as os_id, os.sticker_code as os_code, os.player_name as os_player, os.team_name as os_team,
           ws.id as ws_id, ws.sticker_code as ws_code, ws.player_name as ws_player, ws.team_name as ws_team
    FROM swap_items si
    JOIN stickers os ON os.id = si.offered_sticker_id
    JOIN stickers ws ON ws.id = si.wanted_sticker_id
    WHERE si.swap_id = %s
"""


def _format_swap(r, items):
    return {
        "id": r["id"],
        "status": r["status"],
        "created_at": r["created_at"],
        "offerer_id": r["offerer_id"],
        "receiver_id": r["receiver_id"],
        "offerer": {"id": r["o_id"], "username": r["o_username"]},
        "receiver": {"id": r["r_id"], "username": r["r_username"]},
        "items": [
            {
                "id": i["id"],
                "offered_sticker": {"id": i["os_id"], "sticker_code": i["os_code"], "player_name": i["os_player"], "team_name": i["os_team"]},
                "wanted_sticker":  {"id": i["ws_id"], "sticker_code": i["ws_code"], "player_name": i["ws_player"], "team_name": i["ws_team"]},
            }
            for i in items
        ],
    }


@app.get("/api/swaps")
def get_swaps(me=Depends(get_current_user)):
    with get_db() as db:
        db.execute(SWAP_LIST_QUERY, (me["id"], me["id"]))
        rows = db.fetchall()
        result = []
        for r in rows:
            db.execute(SWAP_ITEMS_QUERY, (r["id"],))
            items = db.fetchall()
            result.append(_format_swap(r, items))
    return result


@app.post("/api/swaps", status_code=201)
def create_swap(body: SwapCreateBody, me=Depends(get_current_user)):
    if not body.items:
        raise HTTPException(400, "At least one swap item required")
    if body.receiver_id == me["id"]:
        raise HTTPException(400, "Cannot swap with yourself")
    with get_db() as db:
        db.execute("""
            SELECT 1 FROM friendships
            WHERE ((requester_id = %s AND receiver_id = %s) OR (requester_id = %s AND receiver_id = %s))
              AND status = 'accepted'
        """, (me["id"], body.receiver_id, body.receiver_id, me["id"]))
        if not db.fetchone():
            raise HTTPException(403, "Not friends with this user")

        for item in body.items:
            db.execute(
                "SELECT 1 FROM user_stickers WHERE user_id = %s AND sticker_id = %s",
                (me["id"], item.offered_sticker_id)
            )
            if not db.fetchone():
                raise HTTPException(400, f"You don't have sticker {item.offered_sticker_id} as a duplicate")
            db.execute(
                "SELECT 1 FROM user_stickers WHERE user_id = %s AND sticker_id = %s",
                (body.receiver_id, item.wanted_sticker_id)
            )
            if not db.fetchone():
                raise HTTPException(400, f"Friend doesn't have sticker {item.wanted_sticker_id} as a duplicate")

        db.execute(
            "INSERT INTO swap_requests (offerer_id, receiver_id) VALUES (%s, %s) RETURNING id",
            (me["id"], body.receiver_id),
        )
        swap_id = db.fetchone()["id"]
        for item in body.items:
            db.execute(
                "INSERT INTO swap_items (swap_id, offered_sticker_id, wanted_sticker_id) VALUES (%s, %s, %s)",
                (swap_id, item.offered_sticker_id, item.wanted_sticker_id),
            )
        db.execute(SWAP_ONE_QUERY, (swap_id,))
        row = db.fetchone()
        db.execute(SWAP_ITEMS_QUERY, (swap_id,))
        items = db.fetchall()
    return _format_swap(row, items)


@app.patch("/api/swaps/{swap_id}")
def update_swap(swap_id: int, body: SwapStatusBody, me=Depends(get_current_user)):
    if body.status not in ("accepted", "rejected", "cancelled"):
        raise HTTPException(400, "Invalid status")
    with get_db() as db:
        db.execute(
            "SELECT offerer_id, receiver_id, status FROM swap_requests WHERE id = %s", (swap_id,)
        )
        row = db.fetchone()
        if not row:
            raise HTTPException(404, "Swap not found")
        if row["status"] != "pending":
            raise HTTPException(409, "Swap already resolved")
        if body.status in ("accepted", "rejected") and row["receiver_id"] != me["id"]:
            raise HTTPException(403, "Only the receiver can accept/reject")
        if body.status == "cancelled" and row["offerer_id"] != me["id"]:
            raise HTTPException(403, "Only the offerer can cancel")
        db.execute(
            "UPDATE swap_requests SET status = %s, updated_at = NOW() WHERE id = %s",
            (body.status, swap_id),
        )
        if body.status == "accepted":
            db.execute("SELECT offered_sticker_id, wanted_sticker_id FROM swap_items WHERE swap_id = %s", (swap_id,))
            items = db.fetchall()
            offerer_id = row["offerer_id"]
            receiver_id = row["receiver_id"]
            for item in items:
                offered = item["offered_sticker_id"]
                wanted = item["wanted_sticker_id"]
                # Decrement offerer's duplicate of the offered sticker
                db.execute(
                    "UPDATE user_stickers SET quantity = quantity - 1 WHERE user_id = %s AND sticker_id = %s",
                    (offerer_id, offered),
                )
                db.execute(
                    "DELETE FROM user_stickers WHERE user_id = %s AND sticker_id = %s AND quantity < 1",
                    (offerer_id, offered),
                )
                # Decrement receiver's duplicate of the wanted sticker
                db.execute(
                    "UPDATE user_stickers SET quantity = quantity - 1 WHERE user_id = %s AND sticker_id = %s",
                    (receiver_id, wanted),
                )
                db.execute(
                    "DELETE FROM user_stickers WHERE user_id = %s AND sticker_id = %s AND quantity < 1",
                    (receiver_id, wanted),
                )
                # Remove from wanted lists
                db.execute(
                    "DELETE FROM user_wanted_stickers WHERE user_id = %s AND sticker_id = %s",
                    (offerer_id, wanted),
                )
                db.execute(
                    "DELETE FROM user_wanted_stickers WHERE user_id = %s AND sticker_id = %s",
                    (receiver_id, offered),
                )
    return {"ok": True}


# ── Scan ──────────────────────────────────────────────────────────────────────

@app.post("/api/scan")
async def scan_sticker(image: UploadFile = File(...), me=Depends(get_current_user)):
    if image.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(415, "Unsupported image type — send JPEG, PNG or WebP")
    raw_bytes = await image.read()
    if len(raw_bytes) > 10 * 1024 * 1024:
        raise HTTPException(413, "Image too large (max 10 MB)")
    try:
        from PIL import Image as PILImage
        from io import BytesIO
        _img = PILImage.open(BytesIO(raw_bytes))
        print(f"[SCAN] received image {_img.size[0]}x{_img.size[1]} mode={_img.mode} bytes={len(raw_bytes)}")
        result = scan_image(raw_bytes)
    except Exception as e:
        raise HTTPException(500, f"OCR error: {e}")
    print(f"[SCAN] status={result['status']} detected={result['detected_codes']}")
    return result


# ── Frontend (production) ─────────────────────────────────────────────────────

_static_dir = os.path.join(os.path.dirname(__file__), "client", "dist")
if os.path.isdir(_static_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(_static_dir, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        file_path = os.path.join(_static_dir, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(_static_dir, "index.html"))
