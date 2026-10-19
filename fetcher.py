import os
import re
import json
import math
import urllib.request
import urllib.parse
import unicodedata
from datetime import datetime, timedelta
from bs4 import BeautifulSoup

HOME_LAT = 51.9563
HOME_LON = 20.1425

SOURCES = [
    ("Klasyki24", "https://klasyki24.pl/kalendarz-imprez-motoryzacyjnych-2026", "https://klasyki24.pl"),
    ("SerwisHub", "https://serwishub.pl/kalendarz", "https://serwishub.pl/kalendarz"),
    ("Tor Łódź", "https://tor-lodz.pl/kalendarz", "https://tor-lodz.pl/kalendarz"),
    ("Autodrom Słomczyn", "http://autodromslomczyn.pl/kalendarz", "http://autodromslomczyn.pl"),
    ("Kalendarz 4x4", "https://kalendarz4x4.pl/nadchodzace", "https://kalendarz4x4.pl/nadchodzace"),
    ("Się Ścigam", "https://siescigam.pl/kalendarz/4x4/wszystkie", "https://siescigam.pl")
]

CITIES = {
    "skierniewice": (51.9563, 20.1425),
    "łódź": (51.7592, 19.4559),
    "tor łódź": (51.8200, 19.5000),
    "słomczyn": (51.9000, 20.8167),
    "warszawa": (52.2297, 21.0122),
    "kielce": (50.8661, 20.6286),
    "piotrków": (51.4056, 19.7031),
    "częstochowa": (50.8118, 19.1204),
    "elbląg": (54.1523, 19.4058),
    "gdańsk": (54.3520, 18.6466),
    "wrocław": (51.1079, 17.0385),
    "katowice": (50.2649, 19.0238),
    "poznań": (52.4068, 16.9293),
    "lublin": (51.2465, 22.5684),
    "szczecin": (53.4285, 14.5528),
    "toruń": (53.0138, 18.5984),
    "radom": (51.4027, 21.1471),
    "góra kalwaria": (51.9833, 21.2167),
    "ełk": (53.8285, 22.3708),
    "pustynia siedlecka": (50.4167, 19.6833),
    "gołdap": (54.3167, 22.3000),
    "ignalin": (50.6000, 17.4000),
    "jelenia góra": (50.9044, 15.7197),
    "skarżysko": (51.1167, 20.8667),
    "zamość": (50.7228, 23.2517),
    "głowaczów": (51.6569, 21.2236),
    "piekary": (50.3833, 18.9500),
    "trzcianka": (53.0397, 16.4575),
    "kroczyce": (50.5833, 19.5833),
    "ogrodzieniec": (50.4500, 19.5167),
    "pilica": (50.4667, 19.6500),
    "kąty wrocławskie": (51.0333, 16.7667),
    "rutka-tartak": (54.2833, 22.9167),
    "maroko": (31.7917, -7.0926),
    "rumunia": (45.9432, 24.9668),
    "gorce": (49.5500, 20.1000),
    "spisz": (49.3833, 20.3167),
    "kudowianka": (50.4397, 16.2417),
    "lubuski": (52.3441, 15.4389),
    "świętokrzyskie": (50.8804, 20.6438),
    "drawsko": (53.5333, 16.0500),
    "kołobrzeg": (54.1759, 15.5832),
    "jordania": (30.5852, 36.2384),
    "tunezja": (33.8869, 9.5375),
    "sudeckie": (50.7500, 16.3333),
    "pomorski": (53.8000, 17.5000),
    "jurajskie": (50.5833, 19.5833),
    "załuski": (52.4833, 20.6167),
    "nieporęt": (52.4333, 21.0333),
    "złotopolice": (52.6167, 20.5833),
    "sulejów": (51.3500, 19.8833),
    "białystok": (53.1325, 23.1688),
    "olsztyn": (53.7784, 20.4801),
    "rzeszów": (50.0413, 21.9990),
    "szczawnica": (54.4167, 18.5667),
    "zakopane": (49.2992, 19.9496),
    "wisła": (49.6559, 18.8596),
    "bielsko": (49.8224, 19.0444),
    "bolimów": (52.0792, 20.1775),
    "żyrardów": (52.0556, 20.4439),
    "budy grabskie": (51.9500, 20.2167),
    "rogów": (51.8167, 19.8833),
    "maków": (51.8500, 20.1833),
    "biała rawska": (51.8167, 20.4833),
    "kraków": (50.0647, 19.9450),
    "częstochowa": (50.8118, 19.1204),
    "śląsk": (50.2649, 19.0238),
    "zagłębie": (50.2833, 19.1167),
    "kazimierza wielka": (50.2667, 20.4833),
    "bolesław": (50.2833, 19.4833),
    "pustynia błędowska": (50.3500, 19.5167),
    "kotlina jeleniogórska": (50.9044, 15.7197),
}

MONTHS_PL = {
    "stycznia": 1, "lutego": 2, "marca": 3, "kwietnia": 4, "maja": 5, "czerwca": 6,
    "lipca": 7, "sierpnia": 8, "września": 9, "października": 10, "listopada": 11, "grudnia": 12
}

STOP_WORDS = {
    "wyprawa", "przejazd", "zawody", "spotkanie", "szkolenie", "zlot", "rajd", "puchar",
    "tor", "z", "ekipa", "i", "oraz", "na", "w", "do", "o", "the", "and", "or", "of", "to",
    "a", "termin", "zapraszamy", "nadchodzace", "oficjalna", "edycja", "finałową", "rundę",
    "końska", "dolina", "poligon", "poligon4x4", "nowa", "nowo", "dodana", "impreza",
}

OFFROAD_KEYWORDS = [
    "rajd", "rally", "offroad", "off-road", "off road", "4x4", "4×4",
    "teren", "przepraw", "szkoleni", "góra kalwaria", "quad", "atv",
    "ssv", "extreme", "wyczyn",
]


def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2)**2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2)**2)
    return 2 * R * math.asin(math.sqrt(a))


def get_coords(location_name):
    l_lower = location_name.lower().strip()
    for city, coords in CITIES.items():
        if city in l_lower:
            return coords
    return (52.0, 20.5)


def parse_date(date_str):
    # Try textual: "24 października"
    m = re.search(
        r"(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|"
        r"lipca|sierpnia|września|października|listopada|grudnia)",
        date_str, re.I,
    )
    if m:
        day = int(m.group(1))
        month = MONTHS_PL.get(m.group(2).lower(), 0)
        if month > 0:
            try:
                return datetime(datetime.now().year, month, day)
            except ValueError:
                pass

    # Try numeric: "24.10.2026" or "24/10/2026" or "24-10-2026"
    m2 = re.search(r"(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})", date_str)
    if m2:
        day, month = int(m2.group(1)), int(m2.group(2))
        yr = m2.group(3)
        year = int("20" + yr) if len(yr) == 2 else int(yr)
        try:
            return datetime(year, month, day)
        except ValueError:
            pass

    return None


def normalise_date_key(date_str):
    """Return (year, month, day) tuple for grouping — normalises all formats."""
    dt = parse_date(date_str)
    if dt:
        return (dt.year, dt.month, dt.day)
    return None


def slug_to_title(url):
    """Extract a human-readable title from a URL slug, stripping query params."""
    parsed = urllib.parse.urlparse(url)
    path = parsed.path.strip("/")
    parts = path.split("/")
    slug = parts[-1] if parts else ""

    # Skip generic listing slugs
    if not slug or slug in {"nadchodzace", "kalendarz", "wszystkie",
                            "kalendarz-imprez-motoryzacyjnych-2026"}:
        return ""

    # Skip numeric-only slugs like "7292"
    if re.fullmatch(r"\d+", slug):
        return ""

    # Strip trailing date patterns
    slug = re.sub(r'-\d{4}-\d{2}-\d{2}.*', '', slug)
    slug = re.sub(r'-\d{8}', '', slug)

    words = slug.replace("-", " ").split()
    # Remove pure year tokens
    words = [w for w in words if not re.fullmatch(r"\d{4,}", w)]
    title = " ".join(w.capitalize() for w in words)
    return title if len(title) > 3 else ""


def extract_title_from_text(text):
    """Extract a title from the text block by splitting before the first date."""
    # Remove leading date like "23.10.2026" or "23-10-2026"
    t = re.sub(r"^\s*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s*", "", text)

    # If the text starts with a city or region name followed by dash or space, clean it
    t = re.sub(r"^(?:skierniewice|łódź|warszawa|kielce|radom|góra kalwaria|kroczyce|skarżysko|zamość|głowaczów|trzcianka|ogrodzieniec|pilica|rutka-tartak|maroko|rumunia|gorce|lubuski|świętokrzyskie|drawsko|kołobrzeg|jordania|tunezja)\b\s*[-–—:]*\s*", "", t, flags=re.I)

    # Split at the first inline date pattern
    t = re.split(
        r'\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b'
        r'|\b\d{1,2}\s+(?:stycznia|lutego|marca|kwietnia|maja|czerwca|'
        r'lipca|sierpnia|września|października|listopada|grudnia)',
        t, 1
    )[0]

    # Clean up emoji and quotes
    for ch in ['"', '„', '"', '🔥', '📍', '📅', '​', ' ']:
        t = t.replace(ch, '')

    words = t.split()
    # Strip leading stop words
    while words and words[0].lower() in STOP_WORDS:
        words.pop(0)

    title = " ".join(words).strip(" -–—,|")

    if not title or len(title) < 4:
        return ""
    return title


def clean_title_and_desc(raw_text, url):
    full_desc = re.sub(r'\s+', ' ', raw_text).strip()

    # Priority 1: extract from text content first (more descriptive for user)
    title = extract_title_from_text(full_desc)

    # Priority 2: URL slug if text didn't yield a good title
    if not title or len(title) < 4:
        title = slug_to_title(url)

    # Fallback: first sentence
    if not title:
        title = full_desc.split('.')[0][:80]

    # Reject titles that are just a number (date fragment leak)
    if re.fullmatch(r"\d{1,4}", title.strip()):
        # Try harder — look for a named event deep in the text
        # e.g. "08.11.2026 Jura Dla Amatora - Tunel 07-11-2026 ..."
        m = re.search(
            r"\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s+(.+?)(?:\s+\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|$)",
            full_desc
        )
        if m:
            title = m.group(1).strip(" -–—,|")
        else:
            title = full_desc.split('.')[0][:80]

    # Final guard — if still a bare number, prefix with source hint
    if re.fullmatch(r"\d{1,4}", title.strip()):
        title = full_desc[:80]

    return title.strip().capitalize(), full_desc


def fold_pl(text):
    """Fold Polish diacritics so 'góra' and 'gora' compare equal."""
    text = text.replace("ł", "l").replace("Ł", "L")
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c))


# "2 runda", "II tura", "3 edycja" - a distinct installment of the same series
INSTALLMENT_RE = re.compile(
    r'\b(\d{1,2}|i{1,3}|iv|v)\s*(tura|runda|edycja|etap)\b', re.I
)
ROMAN = {"i": "1", "ii": "2", "iii": "3", "iv": "4", "v": "5"}


def installment_sig(title):
    """Return e.g. ('2','runda') when the title names a specific installment."""
    m = INSTALLMENT_RE.search(fold_pl(title).lower())
    if not m:
        return None
    num = m.group(1).lower()
    return (ROMAN.get(num, num), m.group(2).lower())


def get_core_tokens(title):
    """Extract meaningful words (>3 chars, not stop words) for dedup matching."""
    clean = re.sub(r'\?.*$', '', title)  # strip query params that leaked in
    words = re.findall(r'\b\w+\b', fold_pl(clean).lower())
    return {w for w in words if len(w) > 3 and w not in STOP_WORDS}


def dates_match(d1_str, d2_str):
    """Check if two date strings refer to the same calendar day."""
    k1 = normalise_date_key(d1_str)
    k2 = normalise_date_key(d2_str)
    if k1 and k2:
        return k1 == k2
    # Fallback string comparison
    return d1_str.strip().lower() == d2_str.strip().lower()


def dates_overlap(d1_str, d2_str):
    """Check if two date strings share at least one day (accounts for ranges)."""
    # First try exact match
    if dates_match(d1_str, d2_str):
        return True

    # Parse both as start dates and check if they're within 2 days
    dt1 = parse_date(d1_str)
    dt2 = parse_date(d2_str)
    if dt1 and dt2:
        return abs((dt1 - dt2).days) <= 1
    return False


def are_events_duplicate(ev1, ev2):
    # Same source URL (after stripping query params) = definite dup
    if ev1['source'] and ev2['source']:
        u1 = urllib.parse.urlparse(ev1['source'].lower())
        u2 = urllib.parse.urlparse(ev2['source'].lower())
        p1 = u1._replace(query='', fragment='').geturl().rstrip('/')
        p2 = u2._replace(query='', fragment='').geturl().rstrip('/')
        if p1 == p2 and p1 not in {"https://kalendarz4x4.pl/nadchodzace",
                                    "https://siescigam.pl",
                                    "https://klasyki24.pl"}:
            return True

    # Different named installments ("2 runda" vs "3 runda") are distinct events
    sig1 = installment_sig(ev1['title'])
    sig2 = installment_sig(ev2['title'])
    if sig1 and sig2 and sig1 != sig2:
        return False

    # Compare core tokens (diacritics folded)
    toks1 = get_core_tokens(ev1['title'])
    toks2 = get_core_tokens(ev2['title'])

    # Sources often disagree on the date of the same event. Dates must normally
    # overlap, but the same installment + a strong title match is accepted
    # across dates so cross-source duplicates still collapse.
    if not dates_overlap(ev1['date'], ev2['date']):
        if not (sig1 and sig1 == sig2 and toks1 and toks2):
            return False
        inter = toks1 & toks2
        union = toks1 | toks2
        jac = len(inter) / len(union) if union else 0
        if not (len(inter) >= 3 or jac >= 0.6):
            return False

    if not toks1 or not toks2:
        # Also check fullDescription tokens for short-title events
        desc_toks1 = get_core_tokens(ev1.get('fullDescription', ''))
        desc_toks2 = get_core_tokens(ev2.get('fullDescription', ''))
        all1 = toks1 | desc_toks1
        all2 = toks2 | desc_toks2
        if not all1 or not all2:
            return False
        intersection = all1 & all2
        union = all1 | all2
        jaccard = len(intersection) / len(union) if union else 0
        return jaccard >= 0.25

    intersection = toks1 & toks2
    union = toks1 | toks2
    jaccard = len(intersection) / len(union) if union else 0

    # Need at least 2 shared tokens OR >30% Jaccard similarity
    return len(intersection) >= 2 or jaccard >= 0.35


def fetch_and_parse():
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    raw_events = []

    now = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    max_date = now + timedelta(days=75)

    for name, url, fallback_link in SOURCES:
        print(f"Fetching {name} from {url}...")
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=12) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
                soup = BeautifulSoup(html, "html.parser")

                containers = soup.find_all(
                    ["article", "li", "div"],
                    class_=re.compile("event|item|card|post|row", re.I),
                )
                if not containers:
                    containers = soup.find_all(["article", "div", "li"])

                # Use only leaf containers to avoid parent/child duplication.
                # The old implementation searched each container's descendants
                # again for every other container, which became extremely slow
                # on pages containing many nested divs.
                container_ids = {id(item) for item in containers}
                leaf_containers = [
                    c for c in containers
                    if not any(id(desc) in container_ids for desc in c.descendants)
                ]
                if not leaf_containers:
                    leaf_containers = containers

                for tag in leaf_containers:
                    text = tag.get_text(" ", strip=True)
                    if len(text) < 15 or len(text) > 1500:
                        continue

                    # Must contain a year/month hint
                    text_lower = text.lower()
                    if not any(hint in text_lower for hint in [
                        "2026", "październik", "październik", "listopad",
                        "grudzień", "wrzesień", ".10.", ".11.", ".12.",
                        "10.2026", "11.2026", "12.2026",
                    ]):
                        continue

                    # Extract date
                    date_match = re.search(
                        r"(\d{1,2}(?:-\d{1,2})?\s+(?:stycznia|lutego|marca|"
                        r"kwietnia|maja|czerwca|lipca|sierpnia|września|"
                        r"października|listopada|grudnia)"
                        r"|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})",
                        text, re.I,
                    )
                    if not date_match:
                        continue
                    date_str = date_match.group(1)

                    event_dt = parse_date(date_str)
                    if not event_dt or event_dt < now or event_dt > max_date:
                        continue

                    # Extract link
                    link = fallback_link
                    a_tag = tag.find("a")
                    if a_tag and a_tag.get("href"):
                        href = a_tag["href"]
                        if href.startswith("http"):
                            link = href
                        elif href.startswith("/"):
                            parsed_uri = urllib.parse.urlparse(url)
                            link = f"{parsed_uri.scheme}://{parsed_uri.netloc}{href}"

                    # Filter out links that are just the source listing page
                    link_path = urllib.parse.urlparse(link).path.rstrip("/")
                    if link_path in {"/nadchodzace", "/kalendarz", "/wszystkie",
                                     "/kalendarz/4x4/wszystkie",
                                     "/kalendarz-imprez-motoryzacyjnych-2026"}:
                        link = fallback_link

                    title, full_desc = clean_title_and_desc(text, link)

                    # Detect location (check exact city words or sensible fallback)
                    loc = "Skierniewice"
                    for city, coords in CITIES.items():
                        pattern = r'\b' + re.escape(city) + r'\b'
                        if re.search(pattern, text_lower):
                            loc = city.title()
                            break

                    coords = get_coords(loc)
                    dist = round(haversine(HOME_LAT, HOME_LON, coords[0], coords[1]))

                    subcat = "Rajd / Offroad" if any(
                        k in text_lower for k in OFFROAD_KEYWORDS
                    ) else "Zlot / Spot"

                    raw_events.append({
                        "title": title,
                        "fullDescription": full_desc,
                        "subCategory": subcat,
                        "location": loc,
                        "distanceKm": dist,
                        "autoStarred": (subcat == "Rajd / Offroad"),
                        "starred": (subcat == "Rajd / Offroad"),
                        "date": date_str,
                        "source": link,
                    })
        except Exception as e:
            print(f"Error {name}: {e}")

    # --- Deduplication pass ---
    events = []
    for ev in raw_events:
        is_dup = False
        for existing in events:
            if are_events_duplicate(ev, existing):
                is_dup = True
                # Keep the better title (shorter but not a number, not ending in ...)
                new_title = ev['title']
                old_title = existing['title']
                new_is_junk = (
                    re.fullmatch(r"\d{1,4}", new_title.strip())
                    or new_title.endswith("...")
                    or "?category=" in new_title.lower()
                    or new_title.lower().startswith("wydarzenie ")
                    or new_title.lower() == "siescigam.pl"
                )
                old_is_junk = (
                    re.fullmatch(r"\d{1,4}", old_title.strip())
                    or old_title.endswith("...")
                    or "?category=" in old_title.lower()
                    or old_title.lower().startswith("wydarzenie ")
                    or old_title.lower() == "siescigam.pl"
                )
                if old_is_junk and not new_is_junk:
                    existing['title'] = new_title
                elif not old_is_junk and not new_is_junk:
                    if len(new_title) > len(old_title):
                        existing['title'] = new_title

                # Keep the richer description
                if len(ev['fullDescription']) > len(existing['fullDescription']):
                    existing['fullDescription'] = ev['fullDescription']

                # Keep a real source link over a fallback
                if ev['source'].startswith("http") and not existing['source'].startswith("http"):
                    existing['source'] = ev['source']

                # Upgrade subCategory if the dup is Rajd
                if ev['subCategory'] == "Rajd / Offroad":
                    existing['subCategory'] = "Rajd / Offroad"
                    existing['autoStarred'] = True
                    existing['starred'] = True
                break
        if not is_dup:
            events.append(ev)

    # --- Post-filter: remove junk titles that slipped through ---
    clean_events = []
    for ev in events:
        title = ev['title']
        desc = ev.get('fullDescription', '')

        # Skip events where title is just a generic fragment or url-like
        if len(title) < 3 or re.fullmatch(r"https?://.*", title):
            continue

        # Skip events with query-param-polluted titles
        if "?category=" in title.lower():
            cleaned = re.sub(r'\?.*$', '', title).strip()
            if len(cleaned) > 3:
                ev['title'] = cleaned.capitalize()
            else:
                continue

        # Skip "Wydarzenie NNNN" or bare "Wydarzenie" placeholder titles
        if re.fullmatch(r"wydarzenie(\s+\d+)?", title.strip().lower()):
            continue

        # Skip domain-name titles
        if re.fullmatch(r"[a-z]+\.[a-z]+", title.strip().lower()):
            continue

        # Skip entries whose description is mostly ? or empty-looking
        clean_desc = re.sub(r'[\s\d.?]+', '', desc)
        if len(clean_desc) < 10:
            continue

        # Skip "Nowa nowo dodana impreza" junk prefix — extract real title from desc
        if re.search(r"nowa\s+nowo\s+dodana\s+impreza", title.strip().lower()):
            # Try to extract something useful from the description
            m = re.search(
                r"(?:II\s+TURA\s*[-–—]?\s*)?(.+?)(?:\.\.\.|$)",
                desc.split("Skarżysko-Kamienna")[-1].strip() if "Skarżysko" in desc else desc,
            )
            if m and len(m.group(1).strip()) > 5:
                new_title = m.group(1).strip().capitalize()
                inst = INSTALLMENT_RE.search(desc[:220])
                if inst and fold_pl(inst.group(0)).lower() not in fold_pl(new_title).lower():
                    new_title = f"{inst.group(0).upper()} - {new_title}"
                ev['title'] = new_title
            else:
                continue

        clean_events.append(ev)

    with open("events.json", "w", encoding="utf-8") as f:
        json.dump(clean_events, f, ensure_ascii=False, indent=2)
    print(f"Generated {len(clean_events)} clean, deduplicated events.")


if __name__ == "__main__":
    fetch_and_parse()
