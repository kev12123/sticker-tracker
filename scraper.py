#!/usr/bin/env python3
"""
Scrapes Panini World Cup 2026 sticker data from Scanini.app JSON-LD
and stores it in a SQLite database.
"""

import json
import re
import sqlite3
import time

import requests
from bs4 import BeautifulSoup

TEAMS = [
    ("panini", "Panini"),
    ("world-cup-history", "World Cup History"),
    ("algeria", "Algeria"),
    ("argentina", "Argentina"),
    ("australia", "Australia"),
    ("austria", "Austria"),
    ("belgium", "Belgium"),
    ("bosnia-and-herzegovina", "Bosnia and Herzegovina"),
    ("brazil", "Brazil"),
    ("canada", "Canada"),
    ("cape-verde", "Cape Verde"),
    ("colombia", "Colombia"),
    ("cote-divoire", "Ivory Coast"),
    ("dr-congo", "DR Congo"),
    ("croatia", "Croatia"),
    ("curacao", "Curacao"),
    ("czechia", "Czechia"),
    ("ecuador", "Ecuador"),
    ("egypt", "Egypt"),
    ("england", "England"),
    ("spain", "Spain"),
    ("france", "France"),
    ("germany", "Germany"),
    ("ghana", "Ghana"),
    ("haiti", "Haiti"),
    ("iran", "Iran"),
    ("iraq", "Iraq"),
    ("jordan", "Jordan"),
    ("japan", "Japan"),
    ("south-korea", "South Korea"),
    ("saudi-arabia", "Saudi Arabia"),
    ("morocco", "Morocco"),
    ("mexico", "Mexico"),
    ("netherlands", "Netherlands"),
    ("norway", "Norway"),
    ("new-zealand", "New Zealand"),
    ("panama", "Panama"),
    ("paraguay", "Paraguay"),
    ("portugal", "Portugal"),
    ("qatar", "Qatar"),
    ("south-africa", "South Africa"),
    ("scotland", "Scotland"),
    ("senegal", "Senegal"),
    ("switzerland", "Switzerland"),
    ("sweden", "Sweden"),
    ("tunisia", "Tunisia"),
    ("turkey", "Turkey"),
    ("uruguay", "Uruguay"),
    ("united-states", "United States"),
    ("uzbekistan", "Uzbekistan"),
]

BASE_URL = "https://scanini.app/teams/{}"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; PaniniScraper/1.0)"}

# Matches "ARG 17 — Lionel Messi" or "FWC 3 — Official Emblem"
STICKER_RE = re.compile(r"^([A-Z]+)\s+(\d+)\s+[—\-]\s+(.+)$")


def init_db(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS stickers (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            sticker_code  TEXT NOT NULL UNIQUE,
            team_slug     TEXT NOT NULL,
            team_name     TEXT NOT NULL,
            sticker_num   INTEGER NOT NULL,
            player_name   TEXT,
            sticker_type  TEXT NOT NULL CHECK(sticker_type IN ('Player', 'FOIL', 'Team Photo', 'Special')),
            club          TEXT
        );
    """)
    conn.commit()


def classify(name_part, position):
    lower = name_part.lower()
    if "logo" in lower or "emblem" in lower or "foil" in lower:
        return "FOIL", None
    if "photo" in lower or "team photo" in lower:
        return "Team Photo", None
    if any(w in lower for w in [
        "panini", "mascot", "ball", "trophy", "winner", "host",
        "world cup history", "slogan", "official",
    ]):
        return "Special", name_part
    # History stickers like "Italy 1934 - World Cup History"
    if re.search(r"\d{4}", name_part) and "history" in lower:
        return "Special", name_part
    return "Player", name_part


def parse_item_list(data, team_slug, team_name):
    stickers = []
    for item in data.get("itemListElement", []):
        raw = item.get("name", "")
        position = item.get("position", 0)
        m = STICKER_RE.match(raw)
        if not m:
            continue
        code_prefix, num_str, label = m.group(1), m.group(2), m.group(3).strip()
        sticker_code = f"{code_prefix} {num_str}"
        sticker_type, player_name = classify(label, position)
        stickers.append({
            "sticker_code": sticker_code,
            "team_slug": team_slug,
            "team_name": team_name,
            "sticker_num": int(num_str),
            "player_name": player_name,
            "sticker_type": sticker_type,
        })
    return stickers


def scrape_team(session, team_slug, team_name):
    url = BASE_URL.format(team_slug)
    try:
        resp = session.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
        for script in soup.find_all("script", type="application/ld+json"):
            data = json.loads(script.string)
            if data.get("@type") == "ItemList":
                stickers = parse_item_list(data, team_slug, team_name)
                print(f"  [{team_name:30s}] {len(stickers):3d} stickers")
                return stickers
        print(f"  [{team_name:30s}] no ItemList found")
        return []
    except Exception as e:
        print(f"  [{team_name:30s}] ERROR: {e}")
        return []


def save_stickers(conn, stickers):
    conn.executemany("""
        INSERT OR IGNORE INTO stickers
            (sticker_code, team_slug, team_name, sticker_num, player_name, sticker_type, club)
        VALUES
            (:sticker_code, :team_slug, :team_name, :sticker_num, :player_name, :sticker_type, NULL)
    """, stickers)
    conn.commit()


def main():
    db_path = "stickers.db"
    conn = sqlite3.connect(db_path)
    init_db(conn)

    session = requests.Session()
    total = 0

    print(f"Scraping {len(TEAMS)} pages from Scanini.app...\n")

    for team_slug, team_name in TEAMS:
        stickers = scrape_team(session, team_slug, team_name)
        if stickers:
            save_stickers(conn, stickers)
            total += len(stickers)
        time.sleep(0.8)

    conn.close()
    print(f"\nDone. {total} stickers saved to {db_path}")


if __name__ == "__main__":
    main()
