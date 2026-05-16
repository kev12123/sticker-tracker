# Sticker Trader — Architecture & Sequence Diagrams

---

## 1. System Architecture

```mermaid
graph TD
    subgraph Browser["Browser (React SPA)"]
        subgraph Pages
            AP[AuthPage]
            PP[ProfilePage]
        end
        subgraph Components
            SC[StickerScanner]
            SL[StickerList]
            WL[WantedList]
            FL[FriendsList]
            SR[SwapRequests]
        end
        subgraph Infra
            AC[AuthContext\nJWT + user state]
            AX[axios client\nBearer token interceptor]
            TC[ToastContext]
        end

        AP -->|login / signup| AC
        PP --> SC & SL & WL & FL & SR
        SC & SL & WL & FL & SR --> AX
        AC --> AX
        SL & WL & FL & SR --> TC
    end

    subgraph Railway["Railway (Server)"]
        subgraph FastAPI["FastAPI  server.py"]
            AUTH["/api/auth/*\nsignup · login"]
            STICKERS["/api/stickers/*\nlist · lookup · wanted · scan"]
            FRIENDS["/api/friends/*\nfriends · requests · stickers · wanted-matches"]
            SWAPS["/api/swaps\ncreate · accept · reject · cancel"]
            SPA["Static SPA\nclient/dist"]
        end

        subgraph OCR["ocr.py"]
            CLAUDE["Claude Haiku\nvision OCR (primary)"]
            TESS["Tesseract\n(fallback)"]
            FUZZY["Fuzzy code\ncorrection"]
        end

        FastAPI --> OCR
        STICKERS -->|"/api/scan"| OCR
        CLAUDE -->|ANTHROPIC_API_KEY| EXT_CLAUDE[(Anthropic API)]
        OCR --> FUZZY
    end

    subgraph Storage["PostgreSQL  Railway"]
        DB_USERS[(users)]
        DB_STICKERS[(stickers)]
        DB_USER_STICKERS[(user_stickers\nduplicates)]
        DB_WANTED[(user_wanted_stickers)]
        DB_FRIENDS[(friendships)]
        DB_SWAPS[(swap_requests\nswap_items)]
    end

    AX -- "HTTPS /api/*" --> FastAPI
    FastAPI -- psycopg2\nSSL --> Storage
    OCR -- psycopg2 --> DB_STICKERS
```

---

## 2. Data Model

```mermaid
erDiagram
    users {
        int id PK
        text username
        text email
        text password_hash
        text country
    }
    stickers {
        int id PK
        text sticker_code
        text team_name
        text player_name
        text sticker_type
        text club
        int sticker_num
    }
    user_stickers {
        int id PK
        int user_id FK
        int sticker_id FK
        int quantity
    }
    user_wanted_stickers {
        int id PK
        int user_id FK
        int sticker_id FK
    }
    friendships {
        int id PK
        int requester_id FK
        int receiver_id FK
        text status
    }
    swap_requests {
        int id PK
        int offerer_id FK
        int receiver_id FK
        text status
    }
    swap_items {
        int id PK
        int swap_id FK
        int offered_sticker_id FK
        int wanted_sticker_id FK
    }

    users ||--o{ user_stickers : owns
    users ||--o{ user_wanted_stickers : wants
    users ||--o{ friendships : "requests / receives"
    users ||--o{ swap_requests : "offers / receives"
    stickers ||--o{ user_stickers : "is tracked in"
    stickers ||--o{ user_wanted_stickers : "is wanted in"
    stickers ||--o{ swap_items : "offered / wanted"
    swap_requests ||--o{ swap_items : contains
```

---

## 3. Sequence Diagrams

### 3.1 Authentication — Signup & Login

```mermaid
sequenceDiagram
    actor User
    participant AP as AuthPage
    participant AC as AuthContext
    participant API as FastAPI
    participant DB as PostgreSQL

    User->>AP: fill form, submit

    alt Signup
        AP->>AC: signup(username, email, password, country)
        AC->>API: POST /api/auth/signup
        API->>DB: SELECT 1 FROM users WHERE username=?
        DB-->>API: (empty)
        API->>DB: INSERT INTO users ... RETURNING id
        DB-->>API: {id}
        API-->>AC: {token, user}
    else Login
        AP->>AC: login(username, password)
        AC->>API: POST /api/auth/login
        API->>DB: SELECT ... FROM users WHERE username=?
        DB-->>API: {row}
        API->>API: bcrypt verify password
        API-->>AC: {token, user}
    end

    AC->>AC: store token in localStorage\nset user state
    AC-->>AP: resolve
    AP->>AP: navigate("/profile")
```

---

### 3.2 Sticker Scan — Camera → OCR → Add to List

```mermaid
sequenceDiagram
    actor User
    participant SC as StickerScanner
    participant API as FastAPI
    participant OCR as ocr.py
    participant CLAUDE as Anthropic\nClaude Haiku
    participant DB as PostgreSQL

    User->>SC: tap "Open Camera"
    SC->>SC: getUserMedia() → attach stream to <video>
    Note over SC: video element stays in DOM\nthroughout all states

    User->>SC: tap capture button
    SC->>SC: drawImage() onto <canvas>\nresize to max 1200px
    SC->>SC: canvas.toBlob() → JPEG

    SC->>API: POST /api/scan\nmultipart: image
    API->>API: validate content-type & size
    API->>OCR: scan_image(bytes)

    alt ANTHROPIC_API_KEY set (primary path)
        OCR->>OCR: PIL resize to 1000px
        OCR->>OCR: encode to base64
        OCR->>CLAUDE: messages.create()\nimage + prompt
        CLAUDE-->>OCR: "ARG 17"
        OCR->>OCR: _parse_candidates()
    else Tesseract fallback
        OCR->>OCR: _crop_badge() top-right corner
        OCR->>OCR: Otsu threshold + invert
        OCR->>OCR: pytesseract PSM 11/6/7
        OCR->>OCR: _parse_candidates()
    end

    OCR->>OCR: _fuzzy_correct() each candidate
    OCR->>DB: SELECT ... FROM stickers WHERE sticker_code=?
    DB-->>OCR: sticker row

    alt 1 match
        OCR-->>API: {status:"match", match:{...}}
        API-->>SC: 200 {status:"match", match}
        SC->>API: GET /api/stickers/list
        API->>DB: SELECT user_stickers WHERE user_id=?
        DB-->>API: rows
        API-->>SC: list
        SC->>SC: find existing quantity for this sticker
        SC->>SC: setState MATCH\nshow sticker card
    else multiple matches
        OCR-->>API: {status:"candidates", candidates:[...]}
        API-->>SC: 200 {status:"candidates"}
        SC->>SC: setState CANDIDATES\nuser picks one
    else no match
        OCR-->>API: {status:"no_match"}
        API-->>SC: 200 {status:"no_match"}
        SC->>SC: setState NO_MATCH
    end

    User->>SC: tap "Add to My List"
    SC->>API: POST /api/stickers/list\n{sticker_id}
    API->>DB: SELECT user_stickers WHERE user_id=? AND sticker_id=?
    alt already owned
        DB-->>API: existing row
        API->>DB: UPDATE quantity = quantity + 1
    else new sticker
        API->>DB: INSERT user_stickers (qty=1)
    end
    API-->>SC: {id, quantity, sticker}
    SC->>SC: onAdded() → refresh StickerList\nsetState CAMERA (camera stays open)
```

---

### 3.3 Manual Sticker Lookup

```mermaid
sequenceDiagram
    actor User
    participant SC as StickerScanner
    participant API as FastAPI
    participant DB as PostgreSQL

    User->>SC: tap "type the code manually"
    SC->>SC: setState MANUAL

    User->>SC: type "ARG 17", press Enter
    SC->>API: GET /api/stickers/lookup?code=ARG+17
    API->>DB: SELECT ... FROM stickers WHERE sticker_code='ARG 17'
    DB-->>API: sticker row
    API-->>SC: {id, sticker_code, team_name, ...}

    SC->>API: GET /api/stickers/list
    API-->>SC: user's list
    SC->>SC: find existing qty
    SC->>SC: setState MATCH\nshow sticker card

    User->>SC: tap "Add to My List"
    Note over SC,API: same POST /api/stickers/list flow as §3.2
```

---

### 3.4 Friend Request Flow

```mermaid
sequenceDiagram
    actor Alice
    actor Bob
    participant FL as FriendsList (Alice)
    participant API as FastAPI
    participant DB as PostgreSQL
    participant FL2 as FriendsList (Bob)

    Alice->>FL: search username "bob"
    FL->>API: GET /api/users/search?username=bob
    API->>DB: SELECT id, username, country FROM users WHERE username='bob'
    DB-->>API: {id, username, country}
    API-->>FL: user found

    Alice->>FL: tap "Add Friend"
    FL->>API: POST /api/friends/request\n{user_id: Bob.id}
    API->>DB: SELECT 1 FROM friendships WHERE ...\n(duplicate check)
    API->>DB: INSERT INTO friendships (requester=Alice, receiver=Bob)
    API-->>FL: {ok: true}

    Bob->>FL2: open Friends tab
    FL2->>API: GET /api/friends/requests
    API->>DB: SELECT f.*, u.* FROM friendships JOIN users\nWHERE receiver_id=Bob AND status='pending'
    DB-->>API: [{id, requester: Alice}]
    API-->>FL2: pending requests

    Bob->>FL2: tap "Accept"
    FL2->>API: PATCH /api/friends/request/{friendship_id}\n{accept: true}
    API->>DB: UPDATE friendships SET status='accepted'
    API-->>FL2: {ok: true}

    FL2->>API: GET /api/friends
    API->>DB: SELECT u.*, COUNT(us) as duplicate_count,\nCOUNT(match) as match_count\nFROM friendships JOIN users ...
    DB-->>API: friend list with match counts
    API-->>FL2: [{id, username, duplicate_count, match_count}]
```

---

### 3.5 Viewing Friend's Stickers & Trade Matches

```mermaid
sequenceDiagram
    actor Alice
    participant FL as FriendsList
    participant API as FastAPI
    participant DB as PostgreSQL

    Alice->>FL: tap friend "Bob"
    FL->>FL: open FriendStickerModal

    par fetch Bob's dupes that Alice wants
        FL->>API: GET /api/friends/{bob_id}/stickers
        API->>DB: friendship check
        API->>DB: SELECT user_stickers+stickers WHERE user_id=Bob
        API->>DB: SELECT sticker_id FROM user_wanted WHERE user_id=Alice
        DB-->>API: Bob's stickers + i_want flag
        API-->>FL: [{sticker, quantity, i_want}]
    and fetch Alice's dupes that Bob wants
        FL->>API: GET /api/friends/{bob_id}/wanted-matches
        API->>DB: friendship check
        API->>DB: SELECT us.* FROM user_wanted_stickers uw\nJOIN user_stickers us ON us.sticker_id=uw.sticker_id\nWHERE uw.user_id=Bob AND us.user_id=Alice
        DB-->>API: Alice's stickers that Bob wants
        API-->>FL: [{sticker, quantity}]
    end

    FL->>FL: show banner:\n"Bob has N stickers you want\nYou have M stickers Bob wants"
    FL->>FL: open SwapProposalModal

    Note over FL: Section 1 — Stickers I want from Bob\n  pick which of my dupes to offer in return\nSection 2 — Stickers Bob wants from me\n  pick what I want back from Bob
```

---

### 3.6 Creating a Trade Request

```mermaid
sequenceDiagram
    actor Alice
    participant FL as SwapProposalModal
    participant API as FastAPI
    participant DB as PostgreSQL

    Alice->>FL: select swap pairs, tap "Send Trade Request"
    FL->>API: POST /api/swaps\n{receiver_id: Bob, items:[{offered_sticker_id, wanted_sticker_id}]}

    API->>DB: friendship check
    API->>DB: SELECT 1 FROM user_stickers WHERE user_id=Alice AND sticker_id=offered
    Note over API: verify Alice owns offered stickers
    API->>DB: SELECT 1 FROM user_stickers WHERE user_id=Bob AND sticker_id=wanted
    Note over API: verify Bob owns wanted stickers

    API->>DB: SELECT sticker_code FROM swap_items si\nJOIN swap_requests sr ON sr.id=si.swap_id\nWHERE sr.offerer_id=Alice AND sr.status='pending'\nAND si.offered_sticker_id = ANY(offered_ids)
    Note over API: reject if any offered sticker\nalready in a pending trade

    API->>DB: same check for Bob's wanted stickers
    Note over API: reject if Bob's sticker\nalready committed elsewhere

    API->>DB: INSERT INTO swap_requests (offerer=Alice, receiver=Bob) RETURNING id
    API->>DB: INSERT INTO swap_items (swap_id, offered, wanted) × N
    API->>DB: SELECT swap + items (SWAP_ONE_QUERY + SWAP_ITEMS_QUERY)
    DB-->>API: full swap object
    API-->>FL: 201 {id, status:"pending", offerer, receiver, items}

    FL->>FL: onSent() → close modal, show toast
```

---

### 3.7 Accepting a Trade Request

```mermaid
sequenceDiagram
    actor Bob
    participant SR as SwapRequests
    participant API as FastAPI
    participant DB as PostgreSQL

    Bob->>SR: open Trades tab
    SR->>API: GET /api/swaps
    API->>DB: SELECT swap_requests + users WHERE offerer_id=Bob OR receiver_id=Bob
    API->>DB: SELECT swap_items per swap
    DB-->>API: all swaps with items
    API-->>SR: [{id, status, offerer, receiver, items}]

    Bob->>SR: tap "Accept" on Alice's request
    SR->>API: PATCH /api/swaps/{swap_id}\n{status:"accepted"}

    API->>DB: SELECT offerer_id, receiver_id, status FROM swap_requests WHERE id=?
    API->>API: validate: Bob is receiver, swap is pending

    API->>DB: UPDATE swap_requests SET status='accepted'

    loop for each swap_item
        API->>DB: UPDATE user_stickers SET quantity = quantity - 1\nWHERE user_id=Alice AND sticker_id=offered
        API->>DB: DELETE FROM user_stickers WHERE user_id=Alice\nAND sticker_id=offered AND quantity < 1
        API->>DB: UPDATE user_stickers SET quantity = quantity - 1\nWHERE user_id=Bob AND sticker_id=wanted
        API->>DB: DELETE FROM user_stickers WHERE user_id=Bob\nAND sticker_id=wanted AND quantity < 1
        API->>DB: DELETE FROM user_wanted_stickers\nWHERE user_id=Alice AND sticker_id=wanted
        API->>DB: DELETE FROM user_wanted_stickers\nWHERE user_id=Bob AND sticker_id=offered
    end

    API-->>SR: {ok: true}
    SR->>SR: refresh list, show toast "Trade accepted!"
```

---

### 3.8 Rejecting or Cancelling a Trade

```mermaid
sequenceDiagram
    actor User
    participant SR as SwapRequests
    participant API as FastAPI
    participant DB as PostgreSQL

    alt Receiver rejects
        User->>SR: tap "Reject"
        SR->>API: PATCH /api/swaps/{swap_id} {status:"rejected"}
        API->>API: validate: User is receiver
        API->>DB: UPDATE swap_requests SET status='rejected'
        Note over DB: inventories unchanged
    else Offerer cancels
        User->>SR: tap "Cancel"
        SR->>API: PATCH /api/swaps/{swap_id} {status:"cancelled"}
        API->>API: validate: User is offerer
        API->>DB: UPDATE swap_requests SET status='cancelled'
        Note over DB: inventories unchanged
    end

    API-->>SR: {ok: true}
    SR->>SR: refresh list
```
