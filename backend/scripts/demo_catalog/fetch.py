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
            elif key in ("allow", "disallow"):
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

    def _wait(self) -> None:
        pause = DELAY_S - (time.monotonic() - self.last)
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
        self._wait()
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


def furniture(name, category, url, image, price=None, dims=None, placement=None, room_type=None) -> Item:
    if category == "lampa" and placement is None:
        placement = lamp_placement(name)
    if room_type is None:
        room_type = ROOM_BY_CATEGORY.get(category)
    return Item("furniture", clean_name(name), category, url, image, price, None,
                placement or "pol", room_type, dims or {})


def clean_name(name: str) -> str:
    return re.sub(r"\s+", " ", name or "").strip()[:200]


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
            if "/product/" not in url and "/composite/" not in url:
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
        if not cat or not it.price_uzs or not it.image_url or counts.get(cat, 0) >= quota.get(cat, 0):
            continue
        counts[cat] = counts.get(cat, 0) + 1
        dims = {k: v for k, v in (
            ("footprint_w", cm(p.get("width"))), ("footprint_d", cm(p.get("depth"))),
            ("height_cm", cm(p.get("height"))),
        ) if v}
        out.append(furniture(it.name, cat, it.source_url, it.image_url, it.price_uzs, dims))
    return out


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
            if not (name and image and cat):
                continue
            dims = {}
            m = re.search(r"Размер[^:]{0,20}:\s*(\d{2,3})\s*[×xх*]\s*(\d{2,3})", desc)
            if m and cat in ("divan", "stol", "karavot"):  # for a wardrobe it is width × height
                dims = {"footprint_w": cm(m.group(1)), "footprint_d": cm(m.group(2))}
            out.append(furniture(name, cat, url, image, None, {k: v for k, v in dims.items() if v}))
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
    Store("sanat-hali", "Sanat Hali", "https://www.prom.uz/company/sanat-hali/", fetch_sanat_hali),
    Store("maff", "MAFF", "https://maff.uz", fetch_maff, "+998712055454", "@maffuzbekistan"),
]


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def to_webp(data: bytes) -> bytes | None:
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
            im.thumbnail((MAX_SIDE_PX, MAX_SIDE_PX), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "WEBP", quality=WEBP_QUALITY, method=6)
            return buf.getvalue()
    except Exception as exc:  # a broken or unsupported image is just skipped
        log(f"  image decode failed: {exc}")
        return None


def unique_name(name: str, rows: list[dict]) -> str:
    """(name_uz, store) is the seed's natural key, so a repeated name gets a suffix."""
    taken = {r["name_uz"] for r in rows}
    candidate, n = name, 1
    while candidate in taken:
        n += 1
        candidate = clean_name(f"{name[:190]} ({n})")
    return candidate


def run(out_dir: Path, only: set[str] | None) -> None:
    http = Http()
    catalog_path = out_dir / "catalog.json"
    existing = {}
    if only and catalog_path.exists():
        existing = {s["slug"]: s for s in json.loads(catalog_path.read_text())["stores"]}
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
            data = http.image(quote(it.image_url, safe=":/?=&%~+,;@!$'()*#"))
            webp = to_webp(data) if data else None
            if not webp:
                continue
            n = len(rows) + 1
            (img_dir / f"{n}.webp").write_bytes(webp)
            it.name = unique_name(it.name, rows)
            row = {"kind": it.kind, "name_uz": it.name, "category": it.category, "price_uzs": it.price_uzs}
            if it.kind == "material":
                row["unit"] = it.unit
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
        for key in ("district", "phone", "telegram"):
            if getattr(store, key):
                entry[key] = getattr(store, key)
        entry["items"] = rows
        stores_out.append(entry)
    out_dir.mkdir(parents=True, exist_ok=True)
    catalog_path.write_text(json.dumps({"stores": stores_out}, ensure_ascii=False, indent=1) + "\n")
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
