"""Does Gemini + Google Search find real Uzbek market prices? A throwaway experiment, not app code.

    GEMINI_API_KEY=... python scripts/price_probe.py            # or put the key in backend/.env
    python scripts/price_probe.py --model gemini-2.5-pro --out probe.json

For each material it asks Gemini (with Google Search grounding on) for the current retail price in
Uzbekistan, and prints price, store, the page it came from and the sites Google actually searched.
Judge the result by opening the links yourself: a price without a working link counts as a miss.
Costs a few cents; 10 materials = 10 requests, run one after another.
"""
import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx

# (name as a shopper would search it, unit the price is for)
MATERIALS = [
    ("Gips suvoq (Knauf Rotband yoki shunga o'xshash) 30 kg qop", "qop"),
    ("Grunt chuqur kirib boradigan 10 litr", "kanistr"),
    ("Shpatlyovka boshlang'ich (Knauf HP Start yoki o'xshash) 25 kg", "qop"),
    ("Devor bo'yog'i suvli emulsiya oq 10 litr (Dulux yoki Tikkurila)", "chelak"),
    ("Laminat 8 mm 32 sinf", "m2"),
    ("Pol plintusi PVX 2.5 metr", "dona"),
    ("Gipsokarton list 12.5 mm 1.2x2.5 m", "list"),
    ("Elektr kabel VVGng 3x2.5", "metr"),
    ("LED potolok chiroq panel 18W", "dona"),
    ("Keramogranit pol plitkasi 60x60", "m2"),
]

PROMPT = """Siz O'zbekistondagi qurilish materiallari narxlarini tekshiruvchisiz.
Google qidiruvidan foydalanib, quyidagi mahsulotning HOZIRGI chakana narxini O'zbekiston so'mida toping.

Mahsulot: {name}
Narx qaysi birlik uchun: {unit}

Qoidalar:
- Faqat O'zbekistondagi do'kon yoki e'lon saytlaridagi (masalan olx.uz, uzum.uz, do'kon saytlari) haqiqiy narxni oling.
- Narxni o'zingiz taxmin qilmang va eslab qolgan narxni yozmang. Topolmasangiz price_uzs ni null qiling.
- 2-3 ta turli manbadagi narxni topsangiz, ularning eng arzoni va eng qimmatini ham yozing.
Javobni FAQAT shu JSON ko'rinishida bering, boshqa matnsiz:
{{"price_uzs": son yoki null, "min_uzs": son yoki null, "max_uzs": son yoki null, "unit": "...", "store": "...", "url": "...", "found_on": "sahifa sarlavhasi", "note": "qisqa izoh"}}"""


def load_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    env = Path(__file__).resolve().parent.parent / ".env"
    if not key and env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("GEMINI_API_KEY="):
                key = line.split("=", 1)[1].strip().strip("\"'")
    return key


def ask(client: httpx.Client, key: str, model: str, name: str, unit: str) -> dict:
    resp = client.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        headers={"x-goog-api-key": key},
        json={
            "contents": [{"parts": [{"text": PROMPT.format(name=name, unit=unit)}]}],
            "tools": [{"google_search": {}}],
            "generationConfig": {"temperature": 0},
        },
        timeout=120,
    )
    if resp.status_code != 200:
        return {"error": f"HTTP {resp.status_code}: {resp.text[:300]}", "searched_sites": [], "search_queries": []}
    cand = (resp.json().get("candidates") or [{}])[0]
    text = "".join(p.get("text", "") for p in cand.get("content", {}).get("parts", []))
    meta = cand.get("groundingMetadata", {})
    sites = sorted({c.get("web", {}).get("title", "") for c in meta.get("groundingChunks", [])} - {""})
    queries = meta.get("webSearchQueries", [])
    m = re.search(r"\{.*\}", text, re.S)
    try:
        data = json.loads(m.group(0)) if m else {}
    except json.JSONDecodeError:
        data = {}
    if not data:
        data = {"error": "javob JSON emas", "raw": text[:300]}
    data["searched_sites"] = sites
    data["search_queries"] = queries
    return data


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="gemini-2.5-flash")
    ap.add_argument("--out", default="price_probe_result.json")
    args = ap.parse_args()
    key = load_key()
    if not key:
        print("GEMINI_API_KEY yo'q: muhit o'zgaruvchisi yoki backend/.env ga qo'ying.")
        return 1

    results = []
    with httpx.Client() as client:
        for name, unit in MATERIALS:
            t0 = time.time()
            r = ask(client, key, args.model, name, unit)
            r.update(material=name, asked_unit=unit, seconds=round(time.time() - t0, 1))
            results.append(r)
            price = r.get("price_uzs")
            shown = f"{price:,}".replace(",", " ") if isinstance(price, (int, float)) else "TOPILMADI"
            print(f"\n{name}\n  narx: {shown} so'm / {r.get('unit', '?')}"
                  f"   do'kon: {r.get('store')}   ({r['seconds']} s)"
                  f"\n  havola: {r.get('url')}\n  qidirilgan saytlar: {', '.join(r['searched_sites'][:5]) or '-'}"
                  + (f"\n  XATO: {r['error']}" if "error" in r else ""))
    Path(args.out).write_text(json.dumps(results, ensure_ascii=False, indent=2))
    found = sum(1 for r in results if isinstance(r.get("price_uzs"), (int, float)) and r.get("url"))
    print(f"\n{found}/{len(results)} ta materialda narx va havola topildi. To'liq natija: {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
