"""An AI reading which design styles a shop furniture model suits, from its picture, name and category."""
from __future__ import annotations

import json
import re

from app.config import settings
from app.schemas.admin_catalog import FURNITURE_STYLES
from app.services.design_image import PreparedImage
from app.services.llm import call_llm

MAX_STYLES = 3

_SYSTEM = """Siz mebel uslublari bo'yicha mutaxassissiz. Mebel modeli qaysi uslublarga mosligini aniqlang.

Uslublar va ularning belgilari:
- neoklassika: och ranglar, nafis egri chiziqlar, oddiylashgan klassika;
- klassik: o'ymakorlik, oltin detallar, og'ir matolar;
- zamonaviy: toza chiziqlar, neytral ranglar;
- hitech: metall, shisha, yaltiroq yuzalar, qora va oq;
- minimalist: juda sodda shakllar, detal yo'q;
- skandinav: och yog'och, oq, yumshoq tekstil;
- loft: qora metall, qo'pol yog'och, sanoat ko'rinishi;
- milliy: o'zbek naqshlari, so'zana, o'ymakor yog'och.

Javobni faqat JSON ko'rinishida bering: {"styles": [...]}. Unda 0 dan 3 tagacha uslub bo'lsin, \
eng mosi birinchi. Faqat yuqoridagi nomlardan foydalaning. Ishonch past bo'lsa, bo'sh ro'yxat qaytaring: {"styles": []}."""

_WITH_IMAGE = "Rasm mebel modelining ko'rinishi. Uslubni asosan rasmdan aniqlang, nom va turkum yordamchi."
_NAME_ONLY = "Rasm yo'q. Faqat nom uslubni aniq aytsa qaytaring, aks holda bo'sh ro'yxat qaytaring."


def parse_styles_answer(text: str) -> list[str]:
    """The known styles in a model's reply: the first three it listed, in catalog order.
    Anything unreadable gives an empty list; unknown values are dropped, never raised on."""
    cleaned = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.S)
    if fenced:
        cleaned = fenced.group(1).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        return []
    try:
        data = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError:
        return []
    values = data.get("styles") if isinstance(data, dict) else None
    if not isinstance(values, list):
        return []
    picked: list[str] = []
    for value in values:
        if not isinstance(value, str):
            continue
        style = value.strip().lower()
        if style in FURNITURE_STYLES and style not in picked:
            picked.append(style)
    picked = picked[:MAX_STYLES]
    return [s for s in FURNITURE_STYLES if s in picked]


async def classify_furniture_styles(name_uz: str, category: str, image: PreparedImage | None) -> list[str]:
    """The styles the model suits. LLM errors pass through to the caller (the Celery task).
    user_id=None keeps this off every user's daily limit."""
    text = f"Nom: {name_uz}\nTurkum: {category}\n\n" + (_NAME_ONLY if image is None else _WITH_IMAGE)
    content: list[dict] = []
    if image is not None:
        content.append(
            {"type": "image", "source": {"type": "base64", "media_type": image.media_type, "data": image.data_b64}},
        )
    content.append({"type": "text", "text": text})
    response = await call_llm(
        model=settings.AI_MODEL_BUILDER,
        system=_SYSTEM,
        messages=[{"role": "user", "content": content}],
        max_tokens=200,
        user_id=None,
        model_type="builder",
        timeout=60.0,
        max_retries=2,
        temperature=0,
    )
    answer = "".join(b.text for b in response.content if getattr(b, "type", None) == "text")
    return parse_styles_answer(answer)
