#!/usr/bin/env python3
"""
Scrapes national-football-teams.com for all 48 WC 2026 teams
and enriches stickers.db with club + club country in Panini format:
  CLUB NAME (CTY)
"""

import re
import sqlite3
import time
import unicodedata

import requests
from bs4 import BeautifulSoup
from rapidfuzz import fuzz, process

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; PaniniScraper/1.0)"}
BASE = "https://www.national-football-teams.com/country/{id}/{year}/{slug}.html"

# All 48 WC 2026 teams: (site_id, site_slug, our_team_name)
WC_TEAMS = [
    (3,   "Algeria",              "Algeria"),
    (9,   "Argentina",            "Argentina"),
    (12,  "Australia",            "Australia"),
    (13,  "Austria",              "Austria"),
    (20,  "Belgium",              "Belgium"),
    (26,  "Bosnia_Herzegovina",   "Bosnia and Herzegovina"),
    (28,  "Brazil",               "Brazil"),
    (36,  "Canada",               "Canada"),
    (37,  "Cape_Verde",           "Cape Verde"),
    (43,  "Colombia",             "Colombia"),
    (280, "Curacao",              "Curacao"),
    (47,  "Croatia",              "Croatia"),
    (50,  "Czechia",              "Czechia"),
    (55,  "Dr_Congo",             "DR Congo"),
    (56,  "Ecuador",              "Ecuador"),
    (57,  "Egypt",                "Egypt"),
    (59,  "England",              "England"),
    (67,  "France",               "France"),
    (71,  "Germany",              "Germany"),
    (72,  "Ghana",                "Ghana"),
    (81,  "Haiti",                "Haiti"),
    (88,  "Iran",                 "Iran"),
    (89,  "Iraq",                 "Iraq"),
    (209, "Ivory_Coast",          "Ivory Coast"),
    (94,  "Japan",                "Japan"),
    (95,  "Jordan",               "Jordan"),
    (173, "South_Korea",          "South Korea"),
    (121, "Mexico",               "Mexico"),
    (125, "Morocco",              "Morocco"),
    (129, "Netherlands",          "Netherlands"),
    (132, "New_Zealand",          "New Zealand"),
    (138, "Norway",               "Norway"),
    (142, "Panama",               "Panama"),
    (144, "Paraguay",             "Paraguay"),
    (148, "Portugal",             "Portugal"),
    (150, "Qatar",                "Qatar"),
    (161, "Saudi_Arabia",         "Saudi Arabia"),
    (162, "Scotland",             "Scotland"),
    (163, "Senegal",              "Senegal"),
    (172, "South_Africa",         "South Africa"),
    (174, "Spain",                "Spain"),
    (179, "Sweden",               "Sweden"),
    (180, "Switzerland",          "Switzerland"),
    (190, "Tunisia",              "Tunisia"),
    (192, "Turkey",               "Turkey"),
    (198, "Uruguay",              "Uruguay"),
    (200, "Usa",                  "United States"),
    (201, "Uzbekistan",           "Uzbekistan"),
]

# Full country name → 3-letter Panini code
COUNTRY_CODE_MAP = {
    "Albania": "ALB", "Algeria": "ALG", "Angola": "ANG", "Argentina": "ARG",
    "Armenia": "ARM", "Australia": "AUS", "Austria": "AUT", "Azerbaijan": "AZE",
    "Bahrain": "BHR", "Belgium": "BEL", "Belarus": "BLR", "Bolivia": "BOL",
    "Bosnia": "BIH", "Bosnia & Herzegovina": "BIH", "Bosnia and Herzegovina": "BIH",
    "Brazil": "BRA", "Bulgaria": "BUL", "Burkina Faso": "BFA",
    "Cameroon": "CMR", "Canada": "CAN", "Cape Verde": "CPV",
    "Chile": "CHI", "China": "CHN", "Colombia": "COL", "Congo": "CGO",
    "Costa Rica": "CRC", "Croatia": "CRO", "Cuba": "CUB",
    "Curaçao": "CUR", "Curacao": "CUR", "Czech Republic": "CZE", "Czechia": "CZE",
    "Denmark": "DEN", "DR Congo": "COD", "Ecuador": "ECU",
    "Egypt": "EGY", "El Salvador": "SLV",
    "England": "ENG", "Estonia": "EST", "Ethiopia": "ETH",
    "Finland": "FIN", "France": "FRA", "Gabon": "GAB", "Georgia": "GEO",
    "Germany": "GER", "Ghana": "GHA", "Greece": "GRE", "Guatemala": "GUA",
    "Guinea": "GUI", "Haiti": "HAI", "Honduras": "HON", "Hungary": "HUN",
    "Iceland": "ISL", "India": "IND", "Indonesia": "IDN", "Iran": "IRN",
    "Iraq": "IRQ", "Ireland": "IRL", "Israel": "ISR", "Italy": "ITA",
    "Jamaica": "JAM", "Japan": "JPN", "Jordan": "JOR", "Kazakhstan": "KAZ",
    "Kenya": "KEN", "Kosovo": "KVX", "Kuwait": "KUW",
    "Kyrgyzstan": "KGZ", "Latvia": "LAT", "Lebanon": "LBN", "Libya": "LBA",
    "Lithuania": "LTU", "Luxembourg": "LUX", "Malaysia": "MAS", "Mali": "MLI",
    "Malta": "MLT", "Mexico": "MEX", "Moldova": "MDA", "Montenegro": "MNE",
    "Morocco": "MAR", "Mozambique": "MOZ", "Netherlands": "NED",
    "New Zealand": "NZL", "Nigeria": "NGA",
    "North Macedonia": "MKD", "Northern Ireland": "NIR",
    "Norway": "NOR", "Oman": "OMA", "Panama": "PAN", "Paraguay": "PAR",
    "Peru": "PER", "Philippines": "PHI", "Poland": "POL", "Portugal": "POR",
    "Qatar": "QAT", "Romania": "ROU", "Russia": "RUS", "Rwanda": "RWA",
    "Saudi Arabia": "KSA", "Scotland": "SCO",
    "Senegal": "SEN", "Serbia": "SRB", "Slovakia": "SVK", "Slovenia": "SVN",
    "South Africa": "RSA", "South Korea": "KOR", "Spain": "ESP",
    "Sudan": "SDN", "Sweden": "SWE",
    "Switzerland": "SUI", "Syria": "SYR",
    "Thailand": "THA", "Togo": "TOG", "Trinidad & Tobago": "TRI",
    "Tunisia": "TUN", "Turkey": "TUR", "Turkmenistan": "TKM",
    "Uganda": "UGA", "Ukraine": "UKR",
    "United Arab Emirates": "UAE", "United States": "USA",
    "Uruguay": "URU", "Uzbekistan": "UZB", "Venezuela": "VEN",
    "Wales": "WAL", "Zambia": "ZAM", "Zimbabwe": "ZIM",
    "Ivory Coast": "CIV", "Côte d'Ivoire": "CIV",
    "DR Congo": "COD", "Congo DR": "COD",
    "South Sudan": "SSD", "Cape Verde": "CPV",
    "Faroe Islands": "FRO", "Gibraltar": "GIB", "Malta": "MLT",
    "Andorra": "AND", "Liechtenstein": "LIE", "San Marino": "SMR",
    "Bermuda": "BER", "Barbados": "BRB", "Cuba": "CUB",
    "El Salvador": "SLV", "Honduras": "HON", "Jamaica": "JAM",
    "Nicaragua": "NCA", "Costa Rica": "CRC",
    "Bolivia": "BOL", "Chile": "CHI", "Ecuador": "ECU", "Peru": "PER",
    "Afghanistan": "AFG", "Bangladesh": "BAN", "Cambodia": "CAM",
    "Hong Kong": "HKG", "Indonesia": "IDN", "Kuwait": "KUW",
    "Lebanon": "LBN", "Malaysia": "MAS", "Myanmar": "MYA",
    "Nepal": "NEP", "Oman": "OMA", "Pakistan": "PAK",
    "Palestine": "PLE", "Philippines": "PHI", "Singapore": "SGP",
    "Syria": "SYR", "Taiwan": "TPE", "Tajikistan": "TJK",
    "Thailand": "THA", "Timor-Leste": "TLS", "Turkmenistan": "TKM",
    "Vietnam": "VIE", "Yemen": "YEM",
    "Albania": "ALB", "Armenia": "ARM", "Azerbaijan": "AZE",
    "Belarus": "BLR", "Bulgaria": "BUL", "Cyprus": "CYP",
    "Estonia": "EST", "Finland": "FIN", "Georgia": "GEO",
    "Greece": "GRE", "Hungary": "HUN", "Iceland": "ISL",
    "Ireland": "IRL", "Israel": "ISR", "Kazakhstan": "KAZ",
    "Kosovo": "KVX", "Latvia": "LAT", "Lithuania": "LTU",
    "Luxembourg": "LUX", "Moldova": "MDA", "Montenegro": "MNE",
    "North Macedonia": "MKD", "Romania": "ROU", "Serbia": "SRB",
    "Slovakia": "SVK", "Slovenia": "SVN", "Ukraine": "UKR",
}


def normalize(name):
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_name = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", ascii_name).strip().lower()


def country_to_code(country_name):
    name = country_name.strip()
    if name in COUNTRY_CODE_MAP:
        return COUNTRY_CODE_MAP[name]
    for key, code in COUNTRY_CODE_MAP.items():
        if normalize(name) == normalize(key):
            return code
    # Fallback: first 3 letters uppercased
    return name[:3].upper()


def scrape_team_year(session, site_id, site_slug, team_name, year):
    url = BASE.format(id=site_id, year=year, slug=site_slug)
    try:
        resp = session.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        print(f"  [{team_name}] fetch error: {e}")
        return []

    soup = BeautifulSoup(resp.text, "lxml")
    players = []

    # Find the main squad table — has columns: name, dob, position, club, country, ...
    table = soup.find("table")
    if not table:
        print(f"  [{team_name:35s}] no table found")
        return []

    for row in table.find_all("tr")[1:]:
        cells = row.find_all("td")
        if len(cells) < 5:
            continue

        # Column layout: 0=name, 1=dob, 2=position, 3=flag/country, 4=club, 5+=stats
        player_cell = cells[0]
        # Name is stored as "Surname, Firstname" — convert to "Firstname Surname"
        family = player_cell.find("span", itemprop="familyName")
        given = player_cell.find("span", itemprop="givenName")
        if family and given:
            player_name = f"{given.get_text(strip=True)} {family.get_text(strip=True)}"
        else:
            raw = player_cell.get_text(strip=True)
            if "," in raw:
                surname, firstname = raw.split(",", 1)
                player_name = f"{firstname.strip()} {surname.strip()}"
            else:
                player_name = raw
        if not player_name.strip():
            continue

        # Country from td.flag data-sortvalue attribute
        flag_cell = cells[3]
        club_country_name = flag_cell.get("data-sortvalue", "").replace("_", " ").strip()
        club_country_code = country_to_code(club_country_name) if club_country_name else "???"

        # Club name from td.club
        club_cell = cells[4]
        club_link = club_cell.find("a")
        club_name = club_link.get_text(strip=True) if club_link else club_cell.get_text(strip=True)
        if not club_name:
            continue

        panini_club = f"{club_name.upper()} ({club_country_code})"
        players.append({
            "team": team_name,
            "player_name": player_name,
            "player_norm": normalize(player_name),
            "panini_club": panini_club,
        })

    print(f"  [{team_name:35s}] {len(players)} players")
    return players


def enrich_db(all_players):
    conn = sqlite3.connect("stickers.db")
    c = conn.cursor()

    sticker_rows = c.execute(
        "SELECT id, player_name, team_name FROM stickers WHERE sticker_type='Player'"
    ).fetchall()

    # Build lookup: normalized name → list of player dicts
    wiki_lookup = {}
    for p in all_players:
        wiki_lookup.setdefault(p["player_norm"], []).append(p)

    # Also build per-team fuzzy lookup: team_norm -> list of player dicts
    team_lookup = {}
    for p in all_players:
        team_lookup.setdefault(normalize(p["team"]), []).append(p)

    updated, no_match = 0, []

    for sticker_id, player_name, team_name in sticker_rows:
        key = normalize(player_name)
        team_key = normalize(team_name)

        # 1. Exact match
        matches = wiki_lookup.get(key, [])
        same_team = [m for m in matches if normalize(m["team"]) == team_key]
        chosen = same_team[0] if same_team else (matches[0] if matches else None)

        # 2. Fuzzy fallback within the same team
        if not chosen:
            team_players = team_lookup.get(team_key, [])
            if team_players:
                pool = {p["player_norm"]: p for p in team_players}
                # token_set_ratio handles subsets: "Alisson" matches "Alisson Becker",
                # "Trezeguet" matches "Mahmoud Trezeguet", "Zizo" matches "Ahmed Zizo"
                result = process.extractOne(
                    key, pool.keys(),
                    scorer=fuzz.token_set_ratio,
                    score_cutoff=85
                )
                if result:
                    chosen = pool[result[0]]

        if chosen:
            c.execute("UPDATE stickers SET club=? WHERE id=?", (chosen["panini_club"], sticker_id))
            updated += 1
        else:
            no_match.append((player_name, team_name))

    conn.commit()
    conn.close()

    print(f"\nEnriched: {updated}/{updated + len(no_match)} players")
    if no_match:
        print(f"No club match for {len(no_match)} players (name mismatch or player absent from source):")
        for name, team in sorted(no_match, key=lambda x: x[1]):
            print(f"  {team:30s}  {name}")


def main():
    conn = sqlite3.connect("stickers.db")
    conn.execute("UPDATE stickers SET club = NULL")
    conn.commit()
    conn.close()

    session = requests.Session()
    # player_norm+team -> player dict; 2026 data takes priority over 2025
    player_map = {}

    for year in [2025, 2026]:
        print(f"\nScraping {len(WC_TEAMS)} teams ({year})...")
        for site_id, site_slug, team_name in WC_TEAMS:
            players = scrape_team_year(session, site_id, site_slug, team_name, year)
            for p in players:
                key = (p["player_norm"], p["team"])
                # 2026 overwrites 2025 (more recent club)
                player_map[key] = p
            time.sleep(0.5)

    all_players = list(player_map.values())
    print(f"\nTotal unique players: {len(all_players)}")
    print("\nEnriching DB...")
    enrich_db(all_players)

    # Show sample
    conn = sqlite3.connect("stickers.db")
    c = conn.cursor()
    print("\n=== Sample enriched stickers ===")
    for row in c.execute("""
        SELECT sticker_code, team_name, player_name, club
        FROM stickers WHERE club IS NOT NULL
        ORDER BY team_name, sticker_num LIMIT 25
    """):
        print(f"  {row[0]:10s} {row[1]:25s} {row[2]:25s} {row[3]}")
    enriched = c.execute("SELECT COUNT(*) FROM stickers WHERE club IS NOT NULL").fetchone()[0]
    total_players = c.execute("SELECT COUNT(*) FROM stickers WHERE sticker_type='Player'").fetchone()[0]
    print(f"\nFinal: {enriched}/{total_players} player stickers have club data")
    conn.close()


if __name__ == "__main__":
    main()
