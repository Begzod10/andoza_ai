"""Collect the demo-store catalog from the stores' public websites.

    pip install requests beautifulsoup4 lxml pillow   # not in the backend image
    python scripts/demo_catalog/fetch.py                     # all stores
    python scripts/demo_catalog/fetch.py --only dafna,maff   # some of them

Writes ``app/seed_data/demo_stores/catalog.json`` and one ``images/<store>/<n>.webp``
per item (longest side <= 800 px, WebP quality 75). ``app.seed_demo_stores`` seeds
the database from those files; nothing here touches the database.

Why: the presentation build shows real Tashkent stores with their real products
before any contract is signed, so every row it seeds is marked DEMO and can be
removed with ``python -m app.seed_demo_stores --remove``.

Manners: public listing and product pages only, no login, no forms, one request at
a time with a pause between them, a normal browser User-Agent, and every URL
(images included) is checked against that host's robots.txt first. Downloaded
pages and images are parsed as data, never executed.

Re-running replaces the output files; the seeder is insert-only, so rows that
already exist in a database keep their old data.
"""
from __future__ import annotations

import argparse
import io
import json
import re
import shutil
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import quote, unquote, urljoin, urlsplit

import requests
from bs4 import BeautifulSoup
from PIL import Image

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/129.0 Safari/537.36"
)
DELAY_S = 1.0
MAX_IMAGE_BYTES = 12 * 1024 * 1024
MAX_SIDE_PX = 800
WEBP_QUALITY = 75
PER_STORE = 25

OUT_DEFAULT = Path(__file__).resolve().parents[2] / "app" / "seed_data" / "demo_stores"

Image.MAX_IMAGE_PIXELS = 60_000_000  # refuse decompression bombs


# ---------------------------------------------------------------------------
# Polite HTTP: one request at a time, robots.txt honoured (with * and $)
# ---------------------------------------------------------------------------

class Robots:
    """The `User-agent: *` rules of one host; longest matching rule wins, Allow on a tie."""

    def __init__(self, text: str) -> None:
        self.rules: list[tuple[bool, re.Pattern, int]] = []
        self.crawl_delay = 0.0
        groups: list[tuple[list[str], list[tuple[str, str]]]] = []
        agents: list[str] = []
        rules: list[tuple[str, str]] = []
        last_was_agent = False
        for raw in text.splitlines():
            line = raw.split("#", 1)[0].strip()
            if ":" not in line:
                continue
            key, value = (p.strip() for p in line.split(":", 1))
            key = key.lower()
            if key == "user-agent":
                if not last_was_agent and (agents or rules):
                    groups.append((agents, rules))
                    agents, rules = [], []
                agents.append(value.lower())
                last_was_agent = True
            elif key in ("allow", "disallow", "crawl-delay"):
                rules.append((key, value))
                last_was_agent = False
            else:
                last_was_agent = False
        if agents or rules:
            groups.append((agents, rules))
        for agents, rules in groups:
            if "*" not in agents:
                continue
            for key, value in rules:
                if key == "crawl-delay":
                    try:
                        self.crawl_delay = max(self.crawl_delay, float(value))
                    except ValueError:
                        pass
                    continue
                if not value:
                    continue  # "Disallow:" with nothing = allow all
                pattern = re.escape(value).replace(r"\*", ".*")
                if pattern.endswith(r"\$"):
                    pattern = pattern[:-2] + "$"
                self.rules.append((key == "allow", re.compile(pattern), len(value)))

    def allowed(self, path: str) -> bool:
        best: tuple[int, bool] | None = None
        for allow, pattern, length in self.rules:
            if pattern.match(path):
                if best is None or length > best[0] or (length == best[0] and allow):
                    best = (length, allow)
        return True if best is None else best[1]


class Http:
    def __init__(self) -> None:
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": UA, "Accept-Language": "uz,ru;q=0.9,en;q=0.5"})
        self.robots: dict[str, Robots] = {}
        self.last = 0.0
        self.requests = 0

    def _wait(self, delay: float = DELAY_S) -> None:
        pause = max(DELAY_S, delay) - (time.monotonic() - self.last)
        if pause > 0:
            time.sleep(pause)
        self.last = time.monotonic()

    def _robots_for(self, url: str) -> Robots:
        parts = urlsplit(url)
        host = f"{parts.scheme}://{parts.netloc}"
        if host not in self.robots:
            self._wait()
            self.requests += 1
            try:
                r = self.s.get(host + "/robots.txt", timeout=20)
                text = r.text if r.status_code == 200 else ""
            except requests.RequestException:
                text = ""
            self.robots[host] = Robots(text)
        return self.robots[host]

    def allowed(self, url: str) -> bool:
        parts = urlsplit(url)
        path = parts.path or "/"
        if parts.query:
            path += "?" + parts.query
        return self._robots_for(url).allowed(path)

    def get(self, url: str, *, binary: bool = False) -> requests.Response | None:
        if not self.allowed(url):
            log(f"  robots.txt disallows {url}, skipped")
            return None
        self._wait(self._robots_for(url).crawl_delay)  # a host's Crawl-delay, if longer
        self.requests += 1
        try:
            r = self.s.get(url, timeout=30, stream=binary)
        except requests.RequestException as exc:
            log(f"  {url}: {exc}")
            return None
        if r.status_code != 200:
            log(f"  {url}: HTTP {r.status_code}")
            return None
        return r

    def soup(self, url: str) -> BeautifulSoup | None:
        r = self.get(url)
        return BeautifulSoup(r.content, "lxml") if r is not None else None

    def image(self, url: str) -> bytes | None:
        r = self.get(url, binary=True)
        if r is None:
            return None
        if not r.headers.get("content-type", "").startswith("image/"):
            log(f"  {url}: not an image ({r.headers.get('content-type')})")
            return None
        data = b""
        for chunk in r.iter_content(65536):
            data += chunk
            if len(data) > MAX_IMAGE_BYTES:
                log(f"  {url}: image too large, skipped")
                return None
        return data


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def text_of(soup: BeautifulSoup) -> str:
    return re.sub(r"\s+", " ", soup.get_text(" "))


def meta(soup: BeautifulSoup, prop: str) -> str | None:
    tag = soup.find("meta", property=prop) or soup.find("meta", attrs={"name": prop})
    return tag.get("content").strip() if tag and tag.get("content") else None


def ld_objects(soup: BeautifulSoup) -> list[dict]:
    """Every JSON-LD object on the page, @graph and ItemList members flattened."""
    out: list[dict] = []

    def walk(o):
        if isinstance(o, list):
            for x in o:
                walk(x)
        elif isinstance(o, dict):
            out.append(o)
            for key in ("@graph", "itemListElement", "item"):
                if key in o:
                    walk(o[key])

    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            walk(json.loads(tag.string or ""))
        except (json.JSONDecodeError, TypeError):
            continue
    return out


def ld_products(soup: BeautifulSoup) -> list[dict]:
    return [o for o in ld_objects(soup) if o.get("@type") == "Product"]


def ld_price(p: dict) -> int | None:
    offers = p.get("offers") or {}
    if isinstance(offers, list):
        offers = offers[0] if offers else {}
    if (offers.get("priceCurrency") or "UZS") != "UZS":
        return None
    return to_int(offers.get("price") or offers.get("lowPrice"))


def ld_image(p: dict, base: str) -> str | None:
    img = p.get("image")
    if isinstance(img, list):
        img = img[0] if img else None
    if isinstance(img, dict):
        img = img.get("url")
    return urljoin(base, img) if img else None


def to_int(value) -> int | None:
    if value is None:
        return None
    digits = re.sub(r"[^\d.]", "", str(value).replace(" ", "").replace(" ", ""))
    if not digits:
        return None
    try:
        n = int(float(digits))
    except ValueError:
        return None
    return n if n > 0 else None


def cm(value, unit: str = "см") -> float | None:
    """A length in centimetres from '135.00 см' / '800' + 'мм' etc.; None if implausible."""
    if value is None:
        return None
    m = re.search(r"\d+(?:[.,]\d+)?", str(value))
    if not m:
        return None
    n = float(m.group(0).replace(",", "."))
    u = (unit or "").lower()
    if "мм" in u or u == "mm":
        n /= 10
    elif u in ("м", "m"):
        n *= 100
    return round(n, 1) if 5 <= n <= 999 else None


_DIM_RE = {
    "d": re.compile(r"Диаметр[^\d]{0,15}(\d+(?:[.,]\d+)?)\s*(мм|см|mm|cm)?", re.I),
    "w": re.compile(r"(?:Ширина|Длина)[^\d]{0,15}(\d+(?:[.,]\d+)?)\s*(мм|см|mm|cm)?", re.I),
    "dp": re.compile(r"Глубина[^\d]{0,15}(\d+(?:[.,]\d+)?)\s*(мм|см|mm|cm)?", re.I),
    "h": re.compile(r"Высота[^\d]{0,15}(\d+(?:[.,]\d+)?)\s*(мм|см|mm|cm)?", re.I),
}


def dims_from_text(text: str, default_unit: str = "см") -> dict:
    """footprint_w/footprint_d/height_cm from 'Диаметр 800 мм*Высота 650 мм'-style text."""
    found = {}
    for key, rx in _DIM_RE.items():
        m = rx.search(text)
        if m:
            found[key] = cm(m.group(1), m.group(2) or default_unit)
    out = {}
    if found.get("d"):
        out["footprint_w"] = out["footprint_d"] = found["d"]
    else:
        if found.get("w"):
            out["footprint_w"] = found["w"]
        if found.get("dp"):
            out["footprint_d"] = found["dp"]
    if found.get("h"):
        out["height_cm"] = found["h"]
    return {k: v for k, v in out.items() if v}


# Store category words -> the app's furniture categories (app/schemas/admin_catalog.py).
_CATEGORY_RULES = [
    (r"люстр|lyustra|chandelier|подвесн|қандил", "lampa"),
    (r"\bбра\b|настенн\w* светильник|sconce", "lampa"),
    (r"торшер|настольн\w* ламп|напольн\w* ламп|stol lampa", "lampa"),
    (r"ков[её]р|gilam|carpet", "boshqa"),
    (r"кроват|спальн|krovat|karavot", "karavot"),
    (r"\bстол\b|столик|стол[- ]|обеденн\w* стол|\bstol\b|stolik|table", "stol"),
    (r"стул|табурет|\bstul|chair", "stul"),
    (r"диван|кресл|софа|мягк\w* мебел|пуф|\bpuf\b|divan|kreslo|kursi|sofa", "divan"),
    (r"шкаф|комод|пенал|тумб|стеллаж|гостин|гардероб|прихож|витрин|shkaf|komod", "shkaf"),
]


def classify(text: str) -> str | None:
    t = text.lower()
    for pattern, category in _CATEGORY_RULES:
        if re.search(pattern, t):
            return category
    return None


def lamp_placement(text: str) -> str:
    t = text.lower()
    if re.search(r"\bбра\b|настенн|sconce", t):
        return "devor"
    if re.search(r"торшер|настольн|напольн|stol lampa", t):
        return "pol"
    return "shift"


ROOM_BY_CATEGORY = {"divan": "mehmonxona", "karavot": "yotoqxona"}


@dataclass
class Item:
    kind: str
    name: str
    category: str
    source_url: str
    image_url: str
    price_uzs: int | None = None
    unit: str | None = None
    placement: str | None = None
    room_type: str | None = None
    dims: dict = field(default_factory=dict)
    # Attributes that tell two same-named products apart (colour, brand, size), in order.
    variants: list = field(default_factory=list)


def size_label(dims: dict) -> str | None:
    w, d = dims.get("footprint_w"), dims.get("footprint_d")
    return f"{w:g}×{d:g} см" if w and d else None


def furniture(name, category, url, image, price=None, dims=None, placement=None, room_type=None,
              variants=None) -> Item:
    if category == "lampa" and placement is None:
        placement = lamp_placement(name)
    if room_type is None:
        room_type = ROOM_BY_CATEGORY.get(category)
    dims = dims or {}
    variants = [v for v in [*(variants or []), size_label(dims)] if v]
    return Item("furniture", clean_name(name), category, url, image, price, None,
                placement or "pol", room_type, dims, variants)


# Latin letters that look Cyrillic, as a store sometimes types them inside a Russian
# word ("Cтильный" with a Latin C).
_LOOKALIKE = str.maketrans("ABCEHKMOPTXaceopxy", "АВСЕНКМОРТХасеорху")
# "Люстры [9781-18 GYB]": a category page's plural label plus a model code.
_PLURAL_PREFIX = {
    "Люстры": "Люстра", "Торшеры": "Торшер", "Торшер": "Торшер", "Бра": "Бра",
    "Одинарные светильники": "Светильник", "Потолочные светильники": "Светильник",
}
_PREFIX_RE = re.compile(r"^(%s)\s*\[(.+)\]$" % "|".join(sorted(map(re.escape, _PLURAL_PREFIX), key=len, reverse=True)))


_LOOKALIKE_BACK = str.maketrans("АВСЕНКМОРТХасеорху", "ABCEHKMOPTXaceopxy")


def _fix_word(word: str) -> str:
    """A word mixing scripts takes the script most of its letters are in."""
    cyr = len(re.findall(r"[а-яё]", word, re.I))
    lat = len(re.findall(r"[A-Za-z]", word))
    if cyr and lat:
        # A Cyrillic letter with no Latin twin ("П" in "ПyB") settles it: the word is Russian.
        only_cyr = re.search(r"[^АВСЕНКМОРТХасеорху\W\d_A-Za-z]", word)
        return word.translate(_LOOKALIKE if cyr >= lat or only_cyr else _LOOKALIKE_BACK)
    return word


def clean_name(name: str) -> str:
    name = re.sub(r"\s+", " ", name or "").strip()
    m = _PREFIX_RE.match(name)
    if m:
        name = f"{_PLURAL_PREFIX[m.group(1)]} {m.group(2).strip()}"
    # Parts joined by a hyphen or comma are words of their own ("плит-GRANIT", "Uzkabel,ПуВ").
    name = re.sub(r"[^\s,\-/]+", lambda m: _fix_word(m.group(0)), name)
    if name[:1].islower():
        name = name[0].upper() + name[1:]
    # A store's own copy counter ("кран в/р.ф25 (1)") is not part of the product name.
    name = re.sub(r"\s*\(\d{1,2}\)$", "", name)
    return name.rstrip(".")[:200]


# A multi-piece bundle (a bedroom set, a table with six chairs, a living-room set) is not
# one piece of furniture: it is left out of the demo.
_BUNDLE_RE = re.compile(
    r"комплект|гарнитур|^спальня|^гостиная|^с/с|^г/н|\d\s*стуль|\bнабор|to'plam"
    r"|\sи\s+(\w+\s+)?(тумб|стул|кресл|шкаф|диван|пуф|стол|зеркал|комод)", re.I)


def is_bundle(name: str) -> bool:
    return bool(_BUNDLE_RE.search(name))


# ---------------------------------------------------------------------------
# Store fetchers. Each returns Items; the driver downloads the images.
# ---------------------------------------------------------------------------

def take(items: list[Item], quotas: dict[str, int]) -> list[Item]:
    """Up to quotas[category] items per category, in source order."""
    out, used = [], {}
    for it in items:
        if used.get(it.category, 0) < quotas.get(it.category, 0):
            out.append(it)
            used[it.category] = used.get(it.category, 0) + 1
    return out


def fetch_dafna(http: Http) -> list[Item]:
    r = http.get("https://dafna.uz/sitemaps/sitemap-uz-0.xml")
    if r is None:
        return []
    urls = re.findall(r"<loc>(https://dafna\.uz/uz/product/[^<]+)</loc>", r.text)
    wanted = [
        (r"/product/divan-(?!.*ofis)", 7), (r"/product/krovat", 2), (r"/product/shkaf-garderob", 4),
        (r"/product/kuhonniy-stul", 3), (r"/product/(obedenniy-stol|stol-obedenniy)", 3),
        (r"/product/zhurnalyniy-stolik", 2), (r"/product/komod", 2), (r"/product/lyustra", 3),
    ]
    picked: list[str] = []
    for pattern, n in wanted:
        # Spares: the sitemap still lists discontinued products, whose pages answer 500.
        picked += [u for u in urls if re.search(pattern, u)][: n * 3 + 2]
    items: list[Item] = []
    counts: dict[str, int] = {}
    quota = {"divan": 7, "karavot": 2, "shkaf": 6, "stul": 3, "stol": 5, "lampa": 3}
    for url in picked:
        soup = http.soup(url)
        if soup is None:
            continue
        prods = ld_products(soup)
        if not prods:
            continue
        p = prods[0]
        name, price, image = p.get("name"), ld_price(p), ld_image(p, url)
        cat = classify(f"{name} {url}")
        if not (name and price and image and cat) or counts.get(cat, 0) >= quota.get(cat, 0):
            continue
        counts[cat] = counts.get(cat, 0) + 1
        items.append(furniture(name, cat, url, image, price, _dafna_dims(soup)))
        if len(items) >= PER_STORE:
            break
    return items


def _dafna_dims(soup: BeautifulSoup) -> dict:
    tag = soup.find("script", id="__NEXT_DATA__")
    if not tag or not tag.string:
        return {}
    raw = tag.string
    out = {}
    for en, key in (("Width", "footprint_w"), ("Depth", "footprint_d"), ("Height", "height_cm")):
        m = re.search(r'"name_en":"%s","raw_value":"([\d.,]+)"' % en, raw)
        if m:
            v = cm(m.group(1))
            if v:
                out[key] = v
    return out


def fetch_arca(http: Http) -> list[Item]:
    items: list[Item] = []
    for cat_url in ("https://arcamebel.uz/uz/category/95", "https://arcamebel.uz/uz/category/125"):
        soup = http.soup(cat_url)
        if soup is None:
            continue
        for p in ld_products(soup):
            offers = p.get("offers") or {}
            url = urljoin(cat_url, offers.get("url") or p.get("url") or "")
            if "/product/" not in url:  # /composite/ pages are multi-piece sets
                continue
            items.append(Item("furniture", clean_name(p.get("name") or ""), "", url,
                              ld_image(p, cat_url) or "", ld_price(p)))
    out: list[Item] = []
    quota = {"karavot": 7, "shkaf": 8, "divan": 6, "stol": 4, "stul": 3}
    counts: dict[str, int] = {}
    for it in items:
        if len(out) >= PER_STORE:
            break
        soup = http.soup(it.source_url)
        if soup is None:
            continue
        prods = ld_products(soup)
        p = prods[0] if prods else {}
        desc = (p.get("description") or meta(soup, "og:description") or "")[:160]
        cat = classify(it.name) or classify(desc)
        if is_bundle(it.name) or is_bundle(desc[:40]):
            continue
        if not cat or not it.price_uzs or not it.image_url or counts.get(cat, 0) >= quota.get(cat, 0):
            continue
        counts[cat] = counts.get(cat, 0) + 1
        dims = {k: v for k, v in (
            ("footprint_w", cm(p.get("width"))), ("footprint_d", cm(p.get("depth"))),
            ("height_cm", cm(p.get("height"))),
        ) if v}
        brand = (p.get("brand") or {}).get("name") if isinstance(p.get("brand"), dict) else None
        name = it.name
        if classify(name) is None:  # a bare collection name ("Casa") gets its kind in front
            name = f"{_KIND_RU[cat]} {name}"
        out.append(furniture(name, cat, it.source_url, it.image_url, it.price_uzs, dims,
                             variants=[p.get("color"), brand]))
    return out


_KIND_RU = {"shkaf": "Шкаф", "karavot": "Кровать", "divan": "Диван", "stol": "Стол", "stul": "Стул"}


def fetch_ergo(http: Http) -> list[Item]:
    cats = [
        ("https://ergo.uz/ofisnye-divany", 8),
        ("https://ergo.uz/ofisnye-kresla-i-stulya/obed-stuli-ru-ru", 6),
        ("https://ergo.uz/ofisniye-stoli-ru/jurnalniy-stol-ru", 5),
        ("https://ergo.uz/shkafi-ru/komodi-ru", 3),
        ("https://ergo.uz/shkafi-ru/ofisniye-shkafi", 3),
    ]
    out: list[Item] = []
    for cat_url, n in cats:
        soup = http.soup(cat_url)
        if soup is None:
            continue
        prefix = cat_url.rstrip("/") + "/"
        links = []
        for a in soup.find_all("a", href=True):
            href = urljoin(cat_url, a["href"]).split("?")[0]
            rest = href[len(prefix):] if href.startswith(prefix) else ""
            # a product sits one or two levels below its category page
            if rest and rest.count("/") <= 1 and not rest.endswith("/") and href not in links:
                links.append(href)
        got = 0
        for url in links:
            if got >= n:
                break
            psoup = http.soup(url)
            if psoup is None:
                continue
            prods = ld_products(psoup)
            if not prods:
                continue
            p = prods[0]
            name, price, image = p.get("name"), ld_price(p), ld_image(p, url)
            cat = classify(f"{name} {cat_url}")
            if not (name and price and image and cat):
                continue
            room = "oshxona" if "obed" in cat_url else None
            out.append(furniture(name, cat, url, image, price, room_type=room))
            got += 1
    return out[:PER_STORE]


def fetch_comfort(http: Http) -> list[Item]:
    cats = [
        ("https://comfort-mebel.uz/product-category/divany/", 7),
        ("https://comfort-mebel.uz/product-category/krovati/", 5),
        ("https://comfort-mebel.uz/product-category/%d1%88%d0%ba%d0%b0%d1%84%d1%8b/", 5),
        ("https://comfort-mebel.uz/product-category/stoly-i-stulya/", 4),
        ("https://comfort-mebel.uz/product-category/korpusnaya-mebel/", 2),
        ("https://comfort-mebel.uz/product-category/%d0%ba%d1%80%d0%b5%d1%81%d0%bb%d0%b0/", 2),
    ]
    out: list[Item] = []
    seen: set[str] = set()
    for cat_url, n in cats:
        soup = http.soup(cat_url)
        if soup is None:
            continue
        links = []
        for a in soup.find_all("a", href=True):
            href = a["href"].split("?")[0]
            if "comfort-mebel.uz/product/" in href and href not in links and href not in seen:
                links.append(href)
        got = 0
        for url in links:
            if got >= n:
                break
            seen.add(url)
            psoup = http.soup(url)
            if psoup is None:
                continue
            name = meta(psoup, "og:title")
            image = meta(psoup, "og:image")
            if image:  # older uploads still name a retired subdomain that no longer resolves
                image = image.replace("://new.comfort-mebel.uz/", "://comfort-mebel.uz/")
            desc = meta(psoup, "og:description") or ""
            cat = classify(name or "") or classify(unquote(cat_url))
            if not (name and image and cat) or is_bundle(name):
                continue
            dims = {}
            m = re.search(r"Размер[^:]{0,20}:\s*(\d{2,3})\s*[×xх*]\s*(\d{2,3})", desc)
            if m and cat in ("divan", "stol", "karavot"):  # for a wardrobe it is width × height
                dims = {"footprint_w": cm(m.group(1)), "footprint_d": cm(m.group(2))}
            size = None
            m2 = re.search(r"(?:Размер|Спальное место)[^:]{0,20}:\s*(\d{2,3}\s*[×xх*]\s*\d{2,3})", desc)
            if m2:
                size = re.sub(r"\s*[×xх*]\s*", "×", m2.group(1)) + " см"
            out.append(furniture(name, cat, url, image, None, {k: v for k, v in dims.items() if v},
                                 variants=[size]))
            got += 1
    return out[:PER_STORE]


_KENG_CATS = {
    "myagkaya-mebel": ("divan", 8),
    "spalnyy-garnitur": ("karavot", 6),
    "gostinyy-garnitur": ("shkaf", 4),
    "stol-i-stulya": ("stol", 6),
}


def fetch_keng_makon(http: Http) -> list[Item]:
    r = http.get("https://kengmakon.uz/sitemap.xml")
    if r is None:
        return []
    urls = re.findall(r"<loc>(https://kengmakon\.uz/catalog/([^/<]+)/[^/<]+)</loc>", r.text)
    out: list[Item] = []
    used: dict[str, int] = {}
    for url, cat_slug in urls:
        if cat_slug not in _KENG_CATS or '"' in url:
            continue
        category, n = _KENG_CATS[cat_slug]
        if used.get(cat_slug, 0) >= n:
            continue
        soup = http.soup(url)
        if soup is None:
            continue
        title = soup.select_one(".item-options__title")
        group = soup.select_one(".item-options__category")
        img = soup.select_one("img.swiper-img")
        if not (title and img and img.get("src")):
            continue
        name = f"{group.get_text(strip=True) if group else ''} {title.get_text(strip=True)}"
        cat = category
        if cat_slug == "stol-i-stulya" and re.search(r"chair|stul", url):
            cat = "stul"
        room = "oshxona" if cat_slug == "stol-i-stulya" else None
        out.append(furniture(name, cat, url, urljoin(url, img["src"]), None, room_type=room))
        used[cat_slug] = used.get(cat_slug, 0) + 1
        if len(out) >= PER_STORE - 1:
            break
    return out


def fetch_lumen(http: Http) -> list[Item]:
    cats = [
        ("https://lumenlux.uz/category/liustry", 13, "shift"),
        ("https://lumenlux.uz/category/interernye-bra", 6, "devor"),
        ("https://lumenlux.uz/category/torshery", 6, "pol"),
    ]
    out: list[Item] = []
    for cat_url, n, placement in cats:
        soup = http.soup(cat_url)
        if soup is None:
            continue
        got = 0
        for p in ld_products(soup):
            if got >= n:
                break
            offers = p.get("offers") or {}
            url = p.get("url") or offers.get("url")
            name, price, image = p.get("name"), ld_price(p), ld_image(p, cat_url)
            if not (url and name and image):
                continue
            out.append(furniture(name, "lampa", urljoin(cat_url, url), image, price, placement=placement))
            got += 1
    return out[:PER_STORE]


def fetch_aura(http: Http) -> list[Item]:
    cats = [
        ("https://auralighting.uz/magazin/folder/lyustry", 3, 14, "shift"),
        ("https://auralighting.uz/magazin/folder/bra", 1, 6, "devor"),
        ("https://auralighting.uz/magazin/folder/nastolnye-lampy", 1, 5, "pol"),
    ]
    out: list[Item] = []
    for cat_url, pages, n, placement in cats:
        links: list[str] = []
        for page in range(pages):
            soup = http.soup(cat_url if page == 0 else f"{cat_url}/p/{page}")
            if soup is None:
                break
            for a in soup.find_all("a", href=True):
                href = urljoin(cat_url, a["href"]).split("?")[0]
                if "/magazin/product/" in href and href not in links:
                    links.append(href)
        got = 0
        for url in links:
            if got >= n:
                break
            soup = http.soup(url)
            if soup is None:
                continue
            h1 = soup.find("h1")
            price_el = soup.select_one(".price-current")
            img = next((i for i in soup.find_all("img") if "640r640" in (i.get("src") or "")), None)
            if not (h1 and img):
                continue
            name = h1.get_text(" ", strip=True)
            if placement == "shift" and not re.search(r"люстр", name, re.I):
                name = f"Люстра {name}"
            elif placement == "devor" and not re.search(r"бра", name, re.I):
                name = f"Бра {name}"
            elif placement == "pol" and not re.search(r"ламп|торшер", name, re.I):
                name = f"Лампа {name}"
            price = to_int(price_el.get_text()) if price_el else None
            # Only the product's own size block: the page also carries a search sidebar
            # listing other products' sizes.
            size = soup.select_one(".shop2_product_options, .shop_product_params")
            dims = dims_from_text(size.get_text(" "), "мм") if size else {}
            out.append(furniture(name, "lampa", url, urljoin(url, img["src"]), price,
                                 dims, placement=placement))
            got += 1
    return out[:PER_STORE]


def fetch_bestart(http: Http) -> list[Item]:
    soup = http.soup("https://bestart.uz/product-category/liustry/")
    if soup is None:
        return []
    links = sorted({a["href"].split("?")[0] for a in soup.find_all("a", href=True)
                    if a["href"].startswith("https://bestart.uz/product/")})
    out: list[Item] = []
    for url in links[:PER_STORE]:
        psoup = http.soup(url)
        if psoup is None:
            continue
        h1 = psoup.find("h1")
        image = meta(psoup, "og:image")
        if not (h1 and image):
            continue
        text = text_of(psoup)
        dims = {}
        m = re.search(r"Габариты\s*D\s*(\d+)\s*\*\s*H\s*(\d+)\s*mm", text, re.I)
        if m:
            d, h = cm(m.group(1), "мм"), cm(m.group(2), "мм")
            dims = {k: v for k, v in (("footprint_w", d), ("footprint_d", d), ("height_cm", h)) if v}
        price_el = psoup.select_one(".summary .price .woocommerce-Price-amount, p.price .amount")
        price = to_int(price_el.get_text()) if price_el else None
        out.append(furniture(f"Люстра {h1.get_text(strip=True)}", "lampa", url, image, price, dims,
                             placement="shift"))
    return out


def fetch_sanat_hali(http: Http) -> list[Item]:
    soup = http.soup("https://www.prom.uz/company/sanat-hali/")
    if soup is None:
        return []
    links: list[str] = []
    for a in soup.find_all("a", href=True):
        href = urljoin("https://www.prom.uz/", a["href"]).split("?")[0]
        if "/ads/" in href and href not in links:
            links.append(href)
    out: list[Item] = []
    for url in links[:14]:
        psoup = http.soup(url)
        if psoup is None:
            continue
        prods = ld_products(psoup)
        if not prods:
            continue
        p = prods[0]
        name, image = p.get("name"), ld_image(p, url)
        if not (name and image) or classify(name) != "boshqa":
            continue
        # The listing says "от 380 000 сум" for every rug: a from-price, not this rug's price.
        out.append(furniture(name, "boshqa", url, image, None, placement="pol"))
    return out


# MAFF: listed price is per m² for floors ("Цена за м²") and per piece for doors.
def fetch_maff(http: Http) -> list[Item]:
    cats = [
        ("https://maff.uz/ru/category/laminat-v-tashkente-cena", "laminat", "m2", 10),
        ("https://maff.uz/ru/category/coswick", "parket", "m2", 6),
        ("https://maff.uz/ru/category/mezhkomnatnye-dveri-v-tashkente-cena", "eshik", "dona", 9),
    ]
    out: list[Item] = []
    for cat_url, category, unit, n in cats:
        soup = http.soup(cat_url)
        if soup is None:
            continue
        links: list[tuple[str, bool]] = []
        for a in soup.find_all("a", href=True):
            if re.fullmatch(r"/product/\d+", a["href"]):
                url = "https://maff.uz/ru" + a["href"]
                if url not in (u for u, _ in links):
                    links.append((url, "В наличии" in a.get_text(" ")))
        links.sort(key=lambda x: not x[1])  # in-stock first
        got = 0
        for url, _ in links:
            if got >= n:
                break
            psoup = http.soup(url)
            if psoup is None:
                continue
            prods = ld_products(psoup)
            if not prods:
                continue
            p = prods[0]
            name, price, image = p.get("name"), ld_price(p), ld_image(p, "https://maff.uz/")
            if not (name and price and image):
                continue
            # A floor's price must be the per-m² one; a door's is per leaf.
            if unit == "m2" and not re.search(r"Цена за м(²|2)", text_of(psoup)):
                continue
            out.append(Item("material", clean_name(name), category, url, image, price, unit))
            got += 1
    return out[:PER_STORE]


WALLPAPER_SIDE_PX = 1024


_ROLL_RE = re.compile(r"(\d+[,.]\d+)\s*[*xх×]\s*(\d+(?:[,.]\d+)?)\s*м")


def fetch_modnie_steni(http: Http) -> list[Item]:
    """Модные Стены (modnie-steni.uz, Tashkent): wallpapers with a price per roll. The roll
    size ("1,06*10 м") is in the description or the product's short summary; a product
    without it (many give only the width) is skipped. One colourway per article."""
    cats = [
        "https://www.modnie-steni.uz/collection/as-creation-germaniya-2",
        "https://www.modnie-steni.uz/collection/ostima-rossiya-3",
        "https://www.modnie-steni.uz/collection/ateliero-rossiya-3",
        "https://www.modnie-steni.uz/collection/moskovskaya-oboynaya-fabrika-rossiya-3",
        "https://www.modnie-steni.uz/collection/aspekt-delux-rossiya-2",
        "https://www.modnie-steni.uz/collection/odnotonnye-matovye-oboi-germaniya",
        "https://www.modnie-steni.uz/collection/oboi-s-listyami-i-tsvetami",
        "https://www.modnie-steni.uz/collection/oboi-v-vostochnom-stile",
        "https://www.modnie-steni.uz/collection/fonovye-oboi-shtukaturka",
        "https://www.modnie-steni.uz/collection/oboi-dlya-detskoy-komnaty",
    ]
    per_collection, limit = 4, 28
    out: list[Item] = []
    seen_urls: set[str] = set()
    seen_articles: set[str] = set()
    for cat_url in cats:
        if len(out) >= limit:
            break
        soup = http.soup(cat_url)
        if soup is None:
            continue
        links = []
        for a in soup.find_all("a", href=True):
            href = urljoin(cat_url, a["href"]).split("?")[0]
            if "/product/" in href and href not in links and href not in seen_urls:
                links.append(href)
        got = tried = 0
        for url in links:
            if got >= per_collection or tried >= per_collection * 3 or len(out) >= limit:
                break
            code_m = re.search(r"(\d{4,})", url.rsplit("/", 1)[-1])
            article = code_m.group(1) if code_m else url  # 38850-1 / 38850-2: one article
            if article in seen_articles:
                continue
            seen_urls.add(url)
            tried += 1
            psoup = http.soup(url)
            if psoup is None:
                continue
            prods = ld_products(psoup)
            if not prods:
                continue
            p = prods[0]
            price, image = ld_price(p), ld_image(p, url)
            title = (p.get("name") or "").strip()
            desc = (p.get("description") or "").strip()
            text = text_of(psoup)
            # The product's own block: from its title to the reviews tab.
            i = text.find(title) if title else -1
            block = text[i:text.find("Отзывы", i)] if i >= 0 else ""
            m = _ROLL_RE.search(desc) or _ROLL_RE.search(block)
            if not (price and image and m):
                continue  # no price or no roll size: not seeded
            width_cm = round(float(m.group(1).replace(",", ".")) * 100, 1)
            length_m = round(float(m.group(2).replace(",", ".")), 2)
            if not (30 <= width_cm <= 200 and 3 <= length_m <= 50):
                continue
            brand = re.search(r"Бренд\s+([^.\r\n]+?)(?:\.|\r|\n|$)", desc) or \
                re.search(r"Характеристики Бренд (.+?) Страна", block)
            collection = re.search(r"Коллекция\s+([^\r\n.]+)", desc)
            collection_name = collection.group(1).strip() if collection else (
                desc if desc and " " not in desc and len(desc) <= 20 else None)
            code = re.search(r"\b(\d{4,}[\w-]*)", title)
            parts = [x for x in (brand.group(1).strip() if brand else None, collection_name,
                                 code.group(1) if code else None) if x]
            name = " ".join(parts) if len(parts) >= 2 else re.sub(r"\s*\d[,.]\d+\s*м\b", "", title)
            out.append(Item("wallpaper", clean_name(name.strip(" -"))[:120], "oboy", url, image, price,
                            dims={"roll_width_cm": width_cm, "roll_length_m": length_m}))
            seen_articles.add(article)
            got += 1
    return out


# divan.uz: carpets (Ковры), machine-made, mostly Turkish. Server-rendered product pages:
# the price is in og:title ("по цене 3 049 480 сум"), the size in the specs ("Длина 200 см
# х Ширина 300 см"), stock in itemprop availability. Photos come from cdn0.divan.ru, an
# image proxy that answers 403 for every non-image path, robots.txt included; RFC 9309
# reads a 4xx robots.txt as "no rules", and Http treats it the same way.
DIVAN_CARPETS = 20
_DIVAN_SIZE_RE = re.compile(r"Длина\s*(\d+(?:[.,]\d+)?)\s*см\s*[хx×]\s*Ширина\s*(\d+(?:[.,]\d+)?)\s*см")
_DIVAN_DIAMETER_RE = re.compile(r"Диаметр\s*(\d+(?:[.,]\d+)?)\s*см")
_DIVAN_PRICE_RE = re.compile(r"по цене\s*([\d\s ]+)\s*сум")
_DIVAN_SLUG_SIZE_RE = re.compile(r"-(?:r-)?\d+(?:[xh]\d+)?$")
_RU_TO_LATIN = str.maketrans({
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo", "ж": "j", "з": "z",
    "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r",
    "с": "s", "т": "t", "у": "u", "ф": "f", "х": "x", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sh",
    "ъ": "", "ы": "i", "ь": "", "э": "e", "ю": "yu", "я": "ya",
})


def latin(text: str) -> str:
    """Russian model names in Latin letters, as an Uzbek product name spells them ("Нуэл" -> "Nuel")."""
    out = []
    for ch in text:
        low = ch.lower()
        rep = low.translate(_RU_TO_LATIN)
        out.append(rep.capitalize() if ch != low and rep else rep)
    return "".join(out)


def fetch_divan(http: Http) -> list[Item]:
    r = http.get("https://divan.uz/sitemap.tashkent.xml")
    if r is None:
        return []
    # The sitemap's <loc>s read "https://divan.uzhttp://divan2.local/product/...": keep the path.
    paths = re.findall(r"<loc>[^<]*?(/product/kover-[^<]+)</loc>", r.text)
    urls = list(dict.fromkeys(f"https://divan.uz{p}" for p in paths))
    # One size per design and one design per collection, so the demo shows twenty
    # different rugs rather than one rug in five sizes.
    designs: dict[str, list[str]] = {}
    for u in urls:
        designs.setdefault(_DIVAN_SLUG_SIZE_RE.sub("", u.rsplit("/", 1)[1]), []).append(u)
    # Mostly the 160×230 living-room size; every third pick is a design sold in a large
    # (200×290 / 200×300) size, taken in that size.
    large = re.compile(r"-200(?:x|h)?(?:290|300)$")
    big = [(b, next(u for u in v if large.search(u))) for b, v in designs.items() if any(large.search(u) for u in v)]
    small = [(b, next((u for u in v if u.endswith(("160x230", "160230"))), v[0])) for b, v in designs.items()]
    out: list[Item] = []
    collections: set[str] = set()
    while len(out) < DIVAN_CARPETS and (big or small):
        pool = big if (len(out) % 3 == 2 and big) or not small else small
        base, url = pool.pop(0)
        collection = base.removeprefix("kover-").removeprefix("dvustoronnij-").split("-")[0]
        if collection in collections:
            continue
        soup = http.soup(url)
        if soup is None:
            continue
        h1 = soup.find("h1")
        title = meta(soup, "og:title") or ""
        price_m = _DIVAN_PRICE_RE.search(title)
        avail = soup.find(attrs={"itemprop": "availability"})
        if not (h1 and price_m) or (avail is not None and "InStock" not in (avail.get("content") or "")):
            log(f"  no price or not in stock: {url}")
            continue
        text = text_of(soup)
        size = _DIVAN_SIZE_RE.search(text)
        if size:
            a, b = sorted(float(x.replace(",", ".")) for x in size.groups())
            label = f"{a:g}×{b:g}"
            dims = {"footprint_w": b, "footprint_d": a, "height_cm": 1.0}
        elif (dia := _DIVAN_DIAMETER_RE.search(text)):
            a = float(dia.group(1).replace(",", "."))
            label = f"Ø{a:g}"
            dims = {"footprint_w": a, "footprint_d": a, "height_cm": 1.0}
        else:
            log(f"  no size: {url}")
            continue
        model = re.sub(r"^\s*Ковер\s+(двусторонний\s+)?", "", h1.get_text(" ", strip=True), flags=re.I)
        model = re.sub(r"\s*\d+(?:[xх×]\d+)?\s*$", "", model).strip()
        two_sided = "двусторонн" in h1.get_text(" ", strip=True).lower() or "dvustoronnij" in url
        name = f"{'Ikki tomonlama gilam' if two_sided else 'Gilam'} {latin(model)} {label} sm"
        image = meta(soup, "og:image")
        if not image:
            continue
        price = to_int(re.sub(r"\D", "", price_m.group(1)))
        out.append(furniture(name, "boshqa", url, image, price, dims, placement="pol"))
        collections.add(collection)
    return out


_LOFTBEK_SIZE_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*[xх×]\s*(\d+(?:[.,]\d+)?)\s*[xх×]\s*(\d+(?:[.,]\d+)?)", re.I)


def _loftbek_dims(value: str) -> dict:
    """'130x70x78h' (width × depth × height, cm) -> footprint_w/footprint_d/height_cm."""
    m = _LOFTBEK_SIZE_RE.search(value or "")
    if not m:
        return {}
    w, d, h = (cm(g) for g in m.groups())
    return {k: v for k, v in (("footprint_w", w), ("footprint_d", d), ("height_cm", h)) if v}


def fetch_loftbek(http: Http) -> list[Item]:
    """Loft-style office furniture (WordPress, no shop API): every product in the
    products sitemap, not just PER_STORE — the user asked for the whole range."""
    r = http.get("https://loftbek.uz/products-sitemap.xml")
    if r is None:
        return []
    links = [u for u in re.findall(r"<loc>([^<]+)</loc>", r.text) if "/products/" in u]
    out: list[Item] = []
    for url in links:
        soup = http.soup(url)
        if soup is None:
            continue
        h1 = soup.find("h1")
        image = meta(soup, "og:image")
        if not (h1 and image):
            continue
        # A discounted product shows the old price struck through and the current one below it.
        price_el = soup.select_one(".product__head-price-current") or soup.select_one(
            ".product__head-price .product__item-price")
        price = to_int(price_el.get_text()) if price_el else None
        specs = {}
        for row in soup.select(".product__card-item"):
            key, value = row.select_one(".product__item-key"), row.select_one(".product__item-value")
            if key and value:
                specs[key.get_text(strip=True)] = value.get_text(" ", strip=True)
        # The page's JSON-LD breadcrumb skips the category; the visible one has it
        # ("Столы в стиле лофт › Столы с тумбой"). Most specific first.
        crumbs = [el.get_text(strip=True) for el in soup.select("[class*=breadcrumbs] [property=name]")][::-1]
        name = h1.get_text(strip=True)
        # classify() wants "стол" in the singular; Loftbek's sections are plural
        # ("Столы руководителя", "Журнальные столы") or "Бенч-системы" (desk rows).
        category = next((c for c in map(classify, [name, *crumbs]) if c), None) or (
            "stol" if re.search(r"\bстолы\b|бенч", " ".join(crumbs), re.I) else "boshqa")
        colours = specs.get("Цвета", "").split()
        out.append(furniture(name, category, url, image, price, _loftbek_dims(specs.get("Размеры", "")),
                             variants=[specs.get("Размеры"), *colours[:1]]))
    return out


# Home Interior (Megagroup shop2 site): folder -> (category, word to prefix a bare model
# name with, how many). No carpets on the site; mirrors stand in for decor.
_HOME_INTERIOR_FOLDERS = [
    ("podvesnye-lyustry", "lampa", "Люстра", 10),
    ("bra", "lampa", "Бра", 4),
    ("torshery", "lampa", "Торшер", 4),
    ("nastolnaya-lampa", "lampa", "Настольная лампа", 4),
    ("divany", "divan", "Диван", 8),
    ("kresla", "divan", "Кресло", 5),
    ("kresla-1", "divan", "Кресло", 2),
    ("pufiki", "divan", "Пуф", 2),
    ("stoly-stolovye", "stol", "Стол обеденный", 6),
    ("stulya", "stul", "Стул", 6),
    ("krovati", "karavot", "Кровать", 2),
    ("zerkala", "boshqa", "Зеркало", 6),
]


def _home_interior_cards(soup: BeautifulSoup) -> list:
    """(url, name, price, in_stock, article) of every product card on a folder page;
    many show "Цена по запросу" (price on request) and get price None."""
    out = []
    for form in soup.select("form.shop2-product-item"):
        a = form.select_one(".gr-product-name a[href]")
        if not a:
            continue
        price_el = form.select_one(".price-current strong")
        price = to_int(price_el.get_text().split(".")[0]) if price_el else None
        text = form.get_text(" ")
        art = form.select_one(".product-article")
        art = art.get_text(" ", strip=True).replace("Артикул:", "").strip() if art else ""
        # The article tells same-named pieces apart ("Зеркало", HI-A80); "нет" means none.
        art = art if re.fullmatch(r"[\w-]{2,20}", art) and art.lower() != "нет" else None
        out.append((urljoin("https://homeinterior.uz/", a["href"]), a.get_text(" ", strip=True), price,
                    "Нет в наличии" not in text, art))
    return out


def fetch_home_interior(http: Http) -> list[Item]:
    base = "https://homeinterior.uz"
    out: list[Item] = []
    seen: set[str] = set()
    for folder, category, word, n in _HOME_INTERIOR_FOLDERS:
        cards = []
        soup = http.soup(f"{base}/magazin/folder/{folder}")
        if soup is None:
            continue
        cards += _home_interior_cards(soup)
        if len(cards) < 2 * n and soup.find("a", href=f"/magazin/folder/{folder}/p/1"):
            soup = http.soup(f"{base}/magazin/folder/{folder}/p/1")
            cards += _home_interior_cards(soup) if soup is not None else []
        cards.sort(key=lambda c: (not c[3], not c[2]))  # in stock, then priced, first
        got = 0
        for url, name, price, _, article in cards:
            if got >= n:
                break
            if url in seen or is_bundle(name) or re.search(r"\sс\s+(пуф|стул|зеркал)", name, re.I):
                continue
            psoup = http.soup(url)
            if psoup is None:
                continue
            img = psoup.find("img", src=re.compile(r"/thumb/2/[^/]+/900r900/d/"))
            if not img:
                continue
            options = {}
            for row in psoup.select(".shop2-product-options .option-item"):
                key, value = row.select_one(".option-title"), row.select_one(".option-body")
                if key and value:
                    options[key.get_text(" ", strip=True)] = value.get_text(" ", strip=True)
            dims = dims_from_text(options.get("Размер", ""), "мм")
            # A sofa "260 mm across" is a typo on the site: drop footprints too small for the piece.
            if category != "lampa" and (dims.get("footprint_w") or 99) < 30:
                dims = {}
            if not classify(name) and word.split()[0].lower() not in name.lower():
                name = f"{word} {name.title() if name.isupper() else name}"
            seen.add(url)
            out.append(furniture(name, category, url, urljoin(base, img["src"]), price, dims,
                                 placement="devor" if folder == "zerkala" else None,
                                 variants=[article, options.get("Цвет"), options.get("Страна производитель")]))
            got += 1
    return out


_JAQUAR = "https://www.jaquar.uz"
# Jaquar section -> how many to take and which product names make a good demo
# (whole fixtures, not trim kits, spare parts or panels).
_JAQUAR_QUOTAS = [
    ("smesiteli", 7, r"^Однорычажн\w* (?:моноблочн\w* )?смеситель для (?:раковины|мойки|ванны)|сенсорный смеситель"),
    ("sanfayans", 7, r"раковин|унитаз"),
    ("dushevye-sistemy", 6, r"^(?:\w+: )?(?:верхний душ|ручной душ|душевая панель|однорежимный (?:верхний|ручной) душ|многорежимный)"),
    ("vanny", 4, r"ванна"),
    ("dushevye-ograzhdeniya", 2, r"ограждение"),
]


def _jaquar_name(p: dict) -> str:
    """'Накладная раковина ALIVE ALS 85601'; a name the site cut with '…' takes the
    description's first clause instead."""
    name = p.get("name") or ""
    if name.endswith("…"):
        name = re.split(r",", p.get("desc") or name)[0]
    name = name.rstrip("…").strip()
    if len(name) > 70:
        name = name[:70].rsplit(" ", 1)[0]
        name = re.sub(r"(?:\s+(?:с|и|в|для|из|на|по|под|без))+$", "", name)
    return f"{name} {p['codePrefix']} {p['codeNumber']}"


def fetch_jaquar(http: Http) -> list[Item]:
    """Jaquar Uzbekistan (Odoo-backed SPA). The whole Jaquar range ships as JSON in
    /jaquar-site/ru/catalog-N.js; prices there are the site's own UZS prices
    (the company prices in $ at 12 500 сум and shows the result in сум)."""
    shop = http.get(f"{_JAQUAR}/ru/shop")
    parts = sorted(set(re.findall(r"/jaquar-site/ru/catalog-\d+\.js", shop.text))) if shop is not None else []
    products: list[dict] = []
    for part in parts:
        r = http.get(_JAQUAR + part)
        if r is None:
            continue
        text = r.content.decode("utf-8")
        m = re.search(r"\]\s*=\s*(\[.*\])\s*;?\s*$", text, re.S)
        if not m:
            continue
        try:
            products += json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
    out: list[Item] = []
    for section, n, pattern in _JAQUAR_QUOTAS:
        rx = re.compile(pattern, re.I)
        got, seen_series, kinds = 0, set(), {}
        for p in products:
            if got >= n:
                break
            if p.get("categorySlug") != section or not rx.search(p.get("name") or ""):
                continue
            # A varied range: one per series (baths all share one), at most two of a kind.
            kind = re.sub(r"^\w+: ", "", p["name"])[:30]
            if (section != "vanny" and p.get("seriesSlug") in seen_series) or kinds.get(kind, 0) >= 2:
                continue
            # Chrome is the standard finish; else the product's default photo and price.
            finish = "CHR" if "CHR" in (p.get("ids") or {}) and "CHR" not in (p.get("noFoto") or []) else None
            foto = (p.get("ids") or {}).get(finish) if finish else p.get("foto")
            price = to_int(((p.get("prices") or {}).get(finish) if finish else None) or p.get("price"))
            if not (foto and price):
                continue
            out.append(Item("material", clean_name(_jaquar_name(p)), "santexnika",
                            f"{_JAQUAR}/ru/product/{p['slug']}", f"{_JAQUAR}/jaquar-site/img/{foto}",
                            price, "dona"))
            seen_series.add(p.get("seriesSlug"))
            kinds[kind] = kinds.get(kind, 0) + 1
            got += 1
    return out


_FOONDAMENT = "https://foondament.uz"
_FOONDAMENT_KG_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:кг|kg)\b", re.I)
_FOONDAMENT_LITRE_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:л|l|lt|литр)\b", re.I)
_FOONDAMENT_CABLE_RE = re.compile(r"^(?:uz\s*kabel\s*)?(?:кабел\w*\s*)?(?:пвс|ввг|аввг|avvg|провод\s+кг|кабел\w*\s+кг)", re.I)


def _foondament_cards(http: Http, url: str) -> list[tuple]:
    """(name, product url, price, image url) for each product card on a shop listing page."""
    soup = http.soup(url)
    if soup is None:
        return []
    out = []
    for card in soup.select("form.oe_product_cart"):
        a, img = card.select_one("h2 a[href]"), card.select_one("img.oe_product_image_img")
        price = card.select_one(".product_price .oe_currency_value")
        if a and img and img.get("src"):
            out.append((a.get_text(" ", strip=True), urljoin(_FOONDAMENT, a["href"]),
                        to_int(price.get_text()) if price else None, urljoin(_FOONDAMENT, img["src"])))
    return out


def _foondament_material(name: str, category: str):
    """(category, unit, divisor for the price) for a listing name, or None to skip it."""
    n = name.lower()
    kg = _FOONDAMENT_KG_RE.search(n)
    kg = float(kg.group(1).replace(",", ".")) if kg else 0
    if category == "gips":
        if re.search(r"гипсокартон", n) and not re.search(r"профил|арра|аграф|заполнит|крепл", n):
            return "gips", "dona", 1
        if re.search(r"шпатл|шпакл|штукатур|гипс|fugegyps", n) and kg >= 5:
            return "gips", "qop", 1
        if re.search(r"клей\b.*(плит|керам|гранит|мрамор|мозаик)|graniter|\bцемент", n) \
                and not re.search(r"анти|хризотил|теплоизол|пенополист|газобет", n) and kg >= 5:
            return "sement", "qop", 1
        return None
    if category == "santexnika":
        if re.search(r"смесит|симистет|лейк|сифон|трап|канализац\w* труб|труба для внутренней канал"
                     r"|шаров\w* кран|шар\.\s*кран|вентил|винтел", n) and not re.search(r"газ", n):
            return "santexnika", "dona", 1
        return None
    if category == "elektr_mat":
        if _FOONDAMENT_CABLE_RE.search(n.strip()):
            return "elektr_mat", "m", 1
        if re.search(r"розетк|выкл|преключ|переключ|авт\.|автомат|avtomat|\bщит|\bshit", n) \
                and not re.search(r"бокс|гринка|машин", n):
            return "elektr_mat", "dona", 1
        return None
    if category == "boyoq":
        litres = _FOONDAMENT_LITRE_RE.search(n)
        if litres and re.search(r"краск|эмал|enamel|эмульс", n):
            return "boyoq", "litr", float(litres.group(1).replace(",", "."))
        return None
    return None


def fetch_foondament(http: Http) -> list[Item]:
    """Odoo shop. Listing cards carry name, price and photo; a product without a photo
    gets Odoo's placeholder (served as placeholder_thumbnail.png), which is skipped, and
    so are the 1-sum placeholder prices. Paint is mostly sold by the kilogram here: only
    the cans labelled in litres (found with the shop's own search) are kept."""
    cat = _FOONDAMENT + "/shop/category/"
    # (listing url, our category, how many to keep, pages to scan)
    sources = [
        (cat + "qurilish-materiallari-quruq-aralashmalar-shpatlyovka-va-kafel-yelimi-80", "gips", 16, 10),
        (cat + "qurilish-materiallari-gipsokarton-va-profillar-81", "gips", 2, 2),
        # Tile adhesive (sement) is thin in the category above once photo-less ones go.
        (_FOONDAMENT + "/shop?search=клей", "gips", 6, 3),
        (cat + "santexnika-smesitellar-va-dush-51", "santexnika", 8, 3),
        (cat + "santexnika-traplar-sifonlar-va-kanalizatsiya-52", "santexnika", 6, 3),
        (cat + "santexnika-kranlar-va-berkituvchi-armatura-50", "santexnika", 4, 2),
        (cat + "elektrika-rozetkalar-va-vyklyuchatellar-62", "elektr_mat", 6, 3),
        (cat + "elektrika-avtomatlar-va-shchitlar-63", "elektr_mat", 5, 3),
        (cat + "elektrika-kabellar-va-simlar-65", "elektr_mat", 5, 3),
        (cat + "elektrika-yoritish-64", "lampa", 10, 3),
        (cat + "bo-yoqlar-va-pardozlash-bo-yoqlar-va-emulsiyalar-74?search=LT", "boyoq", 6, 1),
    ]
    caps = {"gips": 10, "sement": 6, "santexnika": 16, "elektr_mat": 14, "lampa": 10, "boyoq": 6}
    out: list[Item] = []
    used: dict[str, int] = {}
    seen: set[str] = set()
    # Sizes of one model ("Авт. выкл. NEXT ... 16A", "... 6A"): at most two of each.
    models: dict[str, int] = {}
    for base, category, n, pages in sources:
        got = 0
        for page in range(1, pages + 1):
            if got >= n:
                break
            if page == 1:
                url = base
            else:
                path, _, query = base.partition("?")
                url = f"{path}/page/{page}" + (f"?{query}" if query else "")
            cards = _foondament_cards(http, url)
            if not cards:
                break
            for name, url, price, image in cards:
                model = re.sub(r"[\d\W_]+", " ", name.lower()).strip()
                # One product shows up under its category path and under plain /shop/.
                key = url.rsplit("-", 1)[-1]
                if got >= n or key in seen or not price or price < 1000 or models.get(model, 0) >= 2:
                    continue
                if category == "lampa":
                    if not re.search(r"plafon|плафон|akril|акрил|panel|панел|светильн|люстр|\bбра\b", name, re.I) \
                            or re.search(r"движени|ламп(а|очк)|bulb", name, re.I):
                        continue
                    kind = None
                else:
                    kind = _foondament_material(name, category)
                    if kind is None:
                        continue
                    if used.get(kind[0], 0) >= caps[kind[0]]:
                        continue
                if category == "lampa" and used.get("lampa", 0) >= caps["lampa"]:
                    continue
                # Odoo serves a grey placeholder for a product without a photo.
                r = http.get(image, binary=True)
                if r is None:
                    continue
                placeholder = "placeholder" in r.headers.get("content-disposition", "")
                r.close()
                if placeholder or not r.headers.get("content-type", "").startswith("image/"):
                    continue
                seen.add(key)
                models[model] = models.get(model, 0) + 1
                if kind is None:
                    out.append(furniture(name, "lampa", url, image, price))
                    used["lampa"] = used.get("lampa", 0) + 1
                else:
                    cat_, unit, per = kind
                    unit_price = round(price / per)
                    out.append(Item("material", clean_name(name), cat_, url, image, unit_price, unit))
                    used[cat_] = used.get(cat_, 0) + 1
                got += 1
    return out[:60]


_QURAMIZ_API = "https://quramiz.uz/api/product2/filter"
_QURAMIZ_PHOTO = "https://e-pos.uz/uploads/products/medium/"


def _quramiz_page(http: Http, catalog: int, page: int = 1) -> list[dict]:
    """One page (12 products) of a catalogue, from the JSON API the site's own catalogue
    page calls. It only answers POST (a GET fails with a server error), so this goes
    through Http's session with the same robots.txt check and pacing as Http.get."""
    url = _QURAMIZ_API + (f"?page={page}" if page > 1 else "")
    if not http.allowed(url):
        log(f"  robots.txt disallows {url}, skipped")
        return []
    http._wait()
    http.requests += 1
    try:
        r = http.s.post(url, json={"catalog": catalog}, timeout=30)
        data = r.json()
    except (requests.RequestException, ValueError) as exc:
        log(f"  {url} catalog {catalog}: {exc}")
        return []
    if r.status_code != 200 or not data.get("status"):
        log(f"  {url} catalog {catalog}: HTTP {r.status_code}")
        return []
    return ((data.get("result") or {}).get("products") or {}).get("data") or []


def _quramiz_material(p: dict, category: str):
    """(category, unit, price) for a product, or None to skip it. The API's `type` is the
    sale unit ("1" piece, "11" metre); `kv_m` + `type_kv_m` say how much one unit holds
    (2.5 "л." of paint, 0.36 "кв.м." of tile)."""
    name = f"{p.get('name', '')} {p.get('title', '')}".lower()
    price = to_int(p.get("price"))
    if not price:
        return None
    try:
        amount = float(p.get("kv_m") or 0)
    except (TypeError, ValueError):
        amount = 0
    holds = str(p.get("type_kv_m") or "")
    if category == "boyoq":
        if holds.startswith("л") and amount > 0 and re.search(r"краск|эмал|эмульс", name):
            return "boyoq", "litr", round(price / amount)
        return None
    if category == "plitka":
        if holds.startswith("кв") and amount > 0:
            return "plitka", "m2", round(price / amount)
        return None
    if category == "gips":
        if "гипсокартон" in name:
            return "gips", "dona", price
        if re.search(r"\d\s*кг", name) or holds.startswith("кг"):
            return "gips", "qop", price
        return None
    if category == "sement":
        if re.search(r"\d\s*кг", name) or holds.startswith("кг"):
            return "sement", "qop", price
        return None
    if category == "elektr_mat":
        if str(p.get("type")) == "11":
            return "elektr_mat", "m", price
        return "elektr_mat", "dona", price
    if category == "santexnika":
        return "santexnika", "dona", price
    return None


def fetch_quramiz(http: Http) -> list[Item]:
    """Quramiz (SQB's building-materials marketplace; Vue front end). Catalogue pages are
    filled in by a JSON API; products live at /cl/product/<id>, photos on e-pos.uz."""
    # (catalogue id, our category, pages to read, how many to keep). Catalogue ids come
    # from /api/product2/header. Pages deep into "Люстры" (230) skip its office panels.
    sources = [
        (348, "boyoq", [1, 2, 3], 8),         # Краска водно-дисперсионная
        (112, "gips", [1, 2], 4),             # Шпаклевки
        (113, "gips", [1], 3),                # Штукатурки
        (117, "gips", [1], 2),                # Листовые материалы (гипсокартон)
        (514, "sement", [1], 2),              # Цемент
        (413, "sement", [1, 2], 4),           # Клей для плитки
        (354, "plitka", [1], 6),              # Изделия из керамогранита
        (318, "elektr_mat", [1, 2], 6),       # Розетки и выключатели скрытой установки
        (242, "elektr_mat", [1, 2], 3),      # Автоматические выключатели
        (304, "elektr_mat", [1], 3),          # Силовой кабель, провод
        (410, "santexnika", [1], 3),          # Раковины
        (347, "santexnika", [1], 2),          # Канализация (сифоны)
        (407, "santexnika", [1], 2),          # Трапы
        (406, "santexnika", [1], 2),          # Полотенцесушители
        (230, "lampa", [50, 80], 4),          # Люстры
        (231, "lampa", [1, 5], 3),            # Бра
        (232, "lampa", [1], 1),               # Подвесные светильники
        (235, "lampa", [1], 2),               # Освещение жилых помещений
        (233, "lampa", [1], 2),               # Встраиваемые
    ]
    out: list[Item] = []
    seen: set = set()
    models: dict = {}
    for catalog, category, pages, n in sources:
        got = 0
        for page in pages:
            if got >= n:
                break
            products = _quramiz_page(http, catalog, page)
            # In stock first.
            products.sort(key=lambda p: not (to_int(p.get("count")) or 0) > 0)
            for p in products:
                if got >= n:
                    break
                pid, photo = p.get("id"), p.get("photo")
                if not pid or not photo or pid in seen or not (to_int(p.get("count")) or 0) > 0:
                    continue
                name = clean_name(f"{(p.get('name') or '').strip().rstrip(',')} {p.get('title') or ''}")
                # Colour/size variants of one model: one each; cables and breakers come in
                # sizes of one series, so three of those (household cross-sections only).
                model = re.sub(r"[\d\W_]+", " ", (p.get("title") or "").lower()).strip()[:25]
                if catalog == 318:  # sockets and switches: three of each kind
                    model = (p.get("name") or "").split(" ")[0]
                if models.get((catalog, model), 0) >= (3 if catalog in (242, 304, 318) else 1):
                    continue
                if catalog == 304 and not re.search(r"[xх]\s*(1,5|2,5|4,0)", p.get("title") or ""):
                    continue
                if catalog == 242 and not re.search(r"\b(10|16|20|25|32)\s*А", p.get("title") or ""):
                    continue
                url, image = f"https://quramiz.uz/cl/product/{pid}", _QURAMIZ_PHOTO + photo
                if category == "lampa":
                    price = to_int(p.get("price"))
                    text = name.lower()
                    if not price or price < 10000 or not re.search(r"светильник|люстр|\bбра\b", text) \
                            or re.search(r"лент|уличн|lrv|lrn", text):
                        continue
                    item = furniture(name, "lampa", url, image, price)
                else:
                    kind = _quramiz_material(p, category)
                    if kind is None or kind[2] < 1000:
                        continue
                    item = Item("material", name, kind[0], url, image, kind[2], kind[1])
                seen.add(pid)
                models[(catalog, model)] = models.get((catalog, model), 0) + 1
                out.append(item)
                got += 1
    return out[:60]


_KS_LUX_PER_M2_RE = re.compile(r"Стоимость 1 м²\s*-\s*([\d\s ]+)\s*UZS")


def _ks_lux_links(http: Http, section: str, pages: int) -> list[str]:
    """Product URLs from a section's product cards (not the sidebar), in-stock first."""
    found: list[tuple[str, bool]] = []
    for page in range(1, pages + 1):
        url = f"https://kslux.uz/catalog/{section}/" + (f"pagen{page}/" if page > 1 else "")
        soup = http.soup(url)
        if soup is None:
            break
        cards = soup.select(".product-items [data-entity=item]")
        if not cards:
            break
        for card in cards:
            a = card.select_one("a.name[href]")
            if not a:
                continue
            link = urljoin("https://kslux.uz/", a["href"])
            if link not in (u for u, _ in found):
                found.append((link, card.select_one(".in-stock") is not None))
    found.sort(key=lambda x: not x[1])
    return [u for u, _ in found]


def fetch_ks_lux(http: Http) -> list[Item]:
    """KS Lux (Bitrix): laminate and SPC with the page's "Стоимость 1 м²" (the card price
    is per pack), porcelain stoneware priced "за м2", and sanitary ware / radiators per piece.
    Paint is left out: its cans carry no volume, so no per-litre price."""
    # (section, pages, category, unit, how many, price kind)
    sections = [
        ("laminat", 3, "laminat", "m2", 14, "m2_calc"),
        ("laminat/spc-laminat", 1, "laminat", "m2", 6, "m2_calc"),
        ("keramogranit/keramogranit-geolam", 3, "plitka", "m2", 10, "m2_listed"),
        ("santekhnika/vanny", 2, "santexnika", "dona", 5, "piece"),
        ("santekhnika/rakoviny", 2, "santexnika", "dona", 5, "piece"),
        ("santekhnika/smesitel-dlya-rakoviny", 1, "santexnika", "dona", 4, "piece"),
        ("santekhnika/smesitel-dlya-dusha", 1, "santexnika", "dona", 3, "piece"),
        ("santekhnika/unitazy", 1, "santexnika", "dona", 4, "piece"),
        ("radiatory-otopleniya/nastennye", 1, "santexnika", "dona", 4, "piece"),
    ]
    out: list[Item] = []
    seen: set[str] = set()
    for section, pages, category, unit, n, kind in sections:
        got = 0
        for url in _ks_lux_links(http, section, pages):
            if got >= n:
                break
            if url in seen:
                continue
            soup = http.soup(url)
            if soup is None:
                continue
            h1 = soup.find("h1")
            image = meta(soup, "og:image")
            if not (h1 and image) or "/upload/" not in image:
                continue
            image = re.sub(r"(?<!:)//+", "/", image)
            name = h1.get_text(" ", strip=True)
            text = text_of(soup)
            price_el = soup.select_one(".price[id$=_price_header_fixed]")
            price = to_int(price_el.get_text()) if price_el else None
            if kind == "m2_calc":
                m = _KS_LUX_PER_M2_RE.search(text)
                price = to_int(m.group(1)) if m else None
                if section == "laminat" and re.search(r"подложк|плинтус|укладк", name, re.I):
                    continue
            elif kind == "m2_listed":
                if "(цена за м2)" not in text:
                    continue
            elif "(цена за шт)" not in text or re.search(
                    r"пульт|кнопк|сидень|крышк|аксессуар|комплект|набор|каркас", name, re.I):
                continue  # accessories, not the fixture itself
            if not price:
                continue
            seen.add(url)
            out.append(Item("material", clean_name(name), category, url, image, price, unit))
            got += 1
    return out[:60]


def _europol_cards(http: Http, section: str) -> list[dict]:
    """Every product card of a catalog section (all its pages): url, name, brand, stock,
    and the card's per-m² price ("228 000 сум за 1 м2")."""
    cards: list[dict] = []
    seen: set[str] = set()
    page, last = 1, 1
    while page <= last:
        url = f"https://europol.uz/ru/catalog/{section}" + (f"/page/{page}" if page > 1 else "")
        soup = http.soup(url)
        if soup is None:
            break
        if page == 1:
            nums = [int(n) for n in re.findall(rf"/ru/catalog/{section}/page/(\d+)", str(soup))]
            last = min(max(nums, default=1), 15)
        for card in soup.select(".product-card"):
            a = card.select_one("a[href^='/ru/product/']")
            h2 = card.find("h2")
            if not (a and h2) or a["href"] in seen:
                continue
            seen.add(a["href"])
            text = re.sub(r"\s+", " ", card.get_text(" "))
            m = re.search(r"([\d  ]+)\s*сум\s*за 1 м(?:2|²)", text)
            brand = card.select_one(".text-gray-600 span")
            cards.append({
                "url": urljoin("https://europol.uz/", a["href"]),
                "name": h2.get_text(" ", strip=True),
                "brand": brand.get_text(strip=True) if brand else "",
                "in_stock": "В наличии" in text,
                "price": to_int(m.group(1)) if m else None,
            })
        page += 1
    return cards


def _europol_spread(cards: list[dict], n: int) -> list[dict]:
    """In-stock first, then round-robin across brands so one brand doesn't fill the quota."""
    by_brand: dict[str, list[dict]] = {}
    for c in sorted(cards, key=lambda c: not c["in_stock"]):
        by_brand.setdefault(c["brand"], []).append(c)
    out: list[dict] = []
    while len(out) < n and any(by_brand.values()):
        for queue in by_brand.values():
            if queue and len(out) < n:
                out.append(queue.pop(0))
    return out


def fetch_europol(http: Http) -> list[Item]:
    """Europol (Nuxt over WooCommerce): laminate and parquet, every card priced "за 1 м2".
    Linoleum and carpet (kovrolin) sections are left out. The photo is the page's og:image
    (dashboard.europol.uz/wp-content/uploads/, which that host's robots.txt allows)."""
    sections = {s: _europol_cards(http, s) for s in ("parket", "laminat")}
    parquet_urls = {c["url"] for c in sections["parket"]}
    out: list[Item] = []
    for section, category in (("laminat", "laminat"), ("parket", "parket")):
        cards = [c for c in sections[section]
                 if c["price"] and not re.search(r"линолеум|ковролин|плинтус|подложк|порог|клей",
                                                 c["name"], re.I)]
        if section == "laminat":
            # HARO's 13.5 mm boards are listed under both; they are parquet construction.
            cards = [c for c in cards if c["url"] not in parquet_urls and "-13-5-" not in c["url"]]
        got = 0
        for c in _europol_spread(cards, 45):
            if got >= 25:
                break
            soup = http.soup(c["url"])
            if soup is None:
                continue
            image = meta(soup, "og:image")
            # The price the page shows, "336 000 сум за 1 м2" (its JSON-LD price is
            # sometimes a few per cent off the displayed one).
            m = re.search(r"([\d  ]+)\s*сум\s*за 1 м(?:2|²)", text_of(soup))
            price = to_int(m.group(1)) if m else None
            if not (image and price and ld_products(soup)) or "/wp-content/uploads/" not in image:
                continue
            out.append(Item("material", clean_name(c["name"]), category, c["url"], image, price, "m2"))
            got += 1
    return out[:60]


@dataclass
class Store:
    slug: str
    name: str
    website: str
    fetch: object
    phone: str | None = None
    telegram: str | None = None
    district: str | None = None


STORES = [
    Store("dafna", "Dafna", "https://dafna.uz", fetch_dafna, "+998785553355", "@Dafnamebel"),
    Store("arca-mebel", "ARCA Mebel", "https://arcamebel.uz", fetch_arca, "+998900042011"),
    Store("ergo", "Ergo", "https://ergo.uz", fetch_ergo, "+998555085555", "@ergouzb"),
    Store("comfort-mebel", "Comfort Mebel", "https://comfort-mebel.uz", fetch_comfort,
          "+998555004040", "@Comfort_mebel_2018"),
    Store("keng-makon", "Keng Makon", "https://kengmakon.uz", fetch_keng_makon,
          "+998983003676", "@kengmakonuz"),
    Store("lumen-lux", "Lumen LUX", "https://lumenlux.uz", fetch_lumen, "+998555005444"),
    Store("aura-lighting", "Aura Lighting", "https://auralighting.uz", fetch_aura,
          "+998959014040", "@auralighting"),
    Store("bestart", "Bestart", "https://bestart.uz", fetch_bestart, "+998882498080"),
    # Sanat Hali (carpets, prom.uz) is left out: its photos are prom.uz /upload/ files,
    # which www.prom.uz's robots.txt disallows (fetch_sanat_hali is kept for reference).
    # Keng Makon yields nothing: its image CDN's robots.txt is "Disallow: /".
    Store("maff", "MAFF", "https://maff.uz", fetch_maff, "+998712055454", "@maffuzbekistan"),
    Store("modnie-steni", "Модные Стены", "https://www.modnie-steni.uz", fetch_modnie_steni, "+998712350708"),
    # Carpets, added in catalog version 3 (its "since" is kept across refetches).
    Store("divan-uz", "Divan.uz", "https://divan.uz", fetch_divan, "+998712050975", "@official_divan_uz"),
    # Loft office furniture, added in catalog version 4.
    Store("loftbek", "Loftbek", "https://loftbek.uz", fetch_loftbek, "+998947772272", "@loftbekk"),
    # Added in catalog version 5. Domus Regia (no prices: "Цена по запросу"), Woodline
    # (no site behind the domain) and DOMPLAN (a design portal, not a shop) are left out.
    Store("home-interior", "Home Interior", "https://homeinterior.uz", fetch_home_interior,
          "+998993690004", "@Homeinterior0004"),
    Store("jaquar", "Jaquar", "https://jaquar.uz", fetch_jaquar, "+998555555520", "@Jaquaruz"),
    Store("foondament", "Foondament", "https://foondament.uz", fetch_foondament, "+998705031111", "@Foondamen"),
    Store("quramiz", "Quramiz", "https://quramiz.uz", fetch_quramiz, "+998555885080", "@quramiz_support"),
    # KS Lux links only a support bot on Telegram, so no handle.
    Store("ks-lux", "KS Lux", "https://kslux.uz", fetch_ks_lux, "+998781138896"),
    Store("europol", "Europol", "https://europol.uz", fetch_europol, "+998555100102", "@europol_uzbekistan"),
]


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def to_webp(data: bytes, side: int = MAX_SIDE_PX) -> bytes | None:
    try:
        with Image.open(io.BytesIO(data)) as im:
            im.load()
            if im.mode in ("RGBA", "LA", "P"):
                im = im.convert("RGBA")
                bg = Image.new("RGB", im.size, (255, 255, 255))
                bg.paste(im, mask=im.split()[-1])
                im = bg
            elif im.mode != "RGB":
                im = im.convert("RGB")
            im.thumbnail((side, side), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "WEBP", quality=WEBP_QUALITY, method=6)
            return buf.getvalue()
    except Exception as exc:  # a broken or unsupported image is just skipped
        log(f"  image decode failed: {exc}")
        return None


def unique_name(it: Item, rows: list[dict]) -> str | None:
    """(name_uz, store) is the seed's natural key. A repeated name takes the first
    attribute from the source page that tells it apart (colour, brand, size); a true
    duplicate (nothing tells it apart) gets None and is left out."""
    taken = {r["name_uz"] for r in rows}
    if it.name not in taken:
        return it.name
    for variant in it.variants:
        candidate = clean_name(f"{it.name[:150]}, {variant}")
        if candidate not in taken:
            return candidate
    return None


def run(out_dir: Path, only: set[str] | None) -> None:
    http = Http()
    catalog_path = out_dir / "catalog.json"
    # The catalog's "version", each store's "since" and the hand-made stores this script
    # does not fetch (the market-average window store) survive a refetch: the seed relies
    # on them to add later rows to a database seeded earlier (app/seed_demo_stores.py).
    # Bump "version" and give new rows "since" by hand when the refetch adds products.
    existing, version = {}, None
    if catalog_path.exists():
        old = json.loads(catalog_path.read_text())
        existing = {s["slug"]: s for s in old["stores"]}
        version = old.get("version")
    fetched = {s.slug for s in STORES}
    stores_out = []
    for store in STORES:
        if only and store.slug not in only:
            if existing.get(store.slug, {}).get("items"):
                stores_out.append(existing[store.slug])
            continue
        log(f"== {store.name}")
        try:
            items = store.fetch(http)
        except Exception as exc:  # one broken site must not lose the others
            log(f"  fetch failed: {exc!r}")
            items = []
        img_dir = out_dir / "images" / store.slug
        if img_dir.exists():
            shutil.rmtree(img_dir)
        img_dir.mkdir(parents=True)
        rows = []
        for it in items:
            if it.kind == "furniture" and is_bundle(it.name):
                log(f"  bundle left out: {it.name}")
                continue
            name = unique_name(it, rows)
            if name is None:
                log(f"  duplicate left out: {it.name} ({it.source_url})")
                continue
            data = http.image(quote(it.image_url, safe=":/?=&%~+,;@!$'()*#"))
            side = WALLPAPER_SIDE_PX if it.kind == "wallpaper" else MAX_SIDE_PX
            webp = to_webp(data, side) if data else None
            if not webp:
                continue
            n = len(rows) + 1
            (img_dir / f"{n}.webp").write_bytes(webp)
            it.name = name
            row = {"kind": it.kind, "name_uz": it.name, "category": it.category, "price_uzs": it.price_uzs}
            if it.kind == "material":
                row["unit"] = it.unit
            elif it.kind == "wallpaper":
                row.update(it.dims)
            else:
                row["placement"] = it.placement
                if it.room_type:
                    row["room_type"] = it.room_type
                row.update(it.dims)
            row["image"] = f"images/{store.slug}/{n}.webp"
            row["source_url"] = it.source_url
            rows.append(row)
        log(f"  {len(rows)} items")
        if not rows:  # e.g. Keng Makon: its image CDN's robots.txt is "Disallow: /"
            shutil.rmtree(img_dir)
            log(f"  {store.name} left out of the catalog")
            continue
        entry = {"slug": store.slug, "name": store.name, "website": store.website}
        if "since" in existing.get(store.slug, {}):
            entry["since"] = existing[store.slug]["since"]
        for key in ("district", "phone", "telegram"):
            if getattr(store, key):
                entry[key] = getattr(store, key)
        entry["items"] = rows
        stores_out.append(entry)
    stores_out += [s for slug, s in existing.items() if slug not in fetched]
    out_dir.mkdir(parents=True, exist_ok=True)
    out = {"version": version, "stores": stores_out} if version else {"stores": stores_out}
    catalog_path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    total = sum(f.stat().st_size for f in (out_dir / "images").rglob("*.webp"))
    log(f"done: {sum(len(s['items']) for s in stores_out)} items, images {total / 1e6:.1f} MB, "
        f"{http.requests} requests")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    ap.add_argument("--only", help="comma-separated store slugs to refetch; the rest are kept")
    args = ap.parse_args()
    run(args.out, set(args.only.split(",")) if args.only else None)


if __name__ == "__main__":
    main()
