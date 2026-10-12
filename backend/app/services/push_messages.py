"""Push copy (uz / ru / en) and the app route each notification opens."""
from __future__ import annotations

_LOCALES = ("uz", "ru", "en")

_RENDER_READY = {
    "uz": ("Dizayningiz tayyor", "Xonangiz uchun AI dizayn tayyor — ko'rish uchun bosing"),
    "ru": ("Ваш дизайн готов", "AI-дизайн вашей комнаты готов — нажмите, чтобы посмотреть"),
    "en": ("Your design is ready", "The AI design for your room is ready — tap to see it"),
}

_ORDER_TITLE = {"uz": "Buyurtma holati", "ru": "Статус заказа", "en": "Order status"}
_ORDER_BODY = {"uz": "Buyurtmangiz: {label}", "ru": "Ваш заказ: {label}", "en": "Your order: {label}"}
_ORDER_LABELS = {
    "gathering": {"uz": "yig'ilmoqda", "ru": "собирается", "en": "being packed"},
    "on_the_way": {"uz": "yo'lda", "ru": "в пути", "en": "on the way"},
    "delivered": {"uz": "yetkazildi", "ru": "доставлен", "en": "delivered"},
    "cancelled": {"uz": "bekor qilindi", "ru": "отменён", "en": "cancelled"},
}

_LEAD_TITLE = {"uz": "Ustalar", "ru": "Мастера", "en": "Ustas"}
_LEAD_BODY = {
    "viewed": {
        "uz": "Usta so'rovingizni ko'rdi",
        "ru": "Мастер посмотрел вашу заявку",
        "en": "The usta has seen your request",
    },
    "contacted": {
        "uz": "Usta siz bilan bog'lanadi",
        "ru": "Мастер свяжется с вами",
        "en": "The usta will contact you",
    },
}


def build_message(kind: str, params: dict, locale: str) -> tuple[str, str, str]:
    """Return ``(title, body, route)`` for a notification, in *locale* (unknown
    locales fall back to uz)."""
    loc = locale if locale in _LOCALES else "uz"
    params = params or {}
    if kind == "render_ready":
        title, body = _RENDER_READY[loc]
        room_id = params.get("room_id")
        return title, body, f"/studio/{room_id}" if room_id else "/"
    if kind == "order_status":
        label = _ORDER_LABELS.get(params.get("status"), {}).get(loc, params.get("status") or "")
        return _ORDER_TITLE[loc], _ORDER_BODY[loc].format(label=label), "/profile/e6"
    if kind == "lead_status":
        body = _LEAD_BODY.get(params.get("status"), {}).get(loc)
        if body is None:
            raise ValueError(f"unknown lead status: {params.get('status')!r}")
        return _LEAD_TITLE[loc], body, "/"
    raise ValueError(f"unknown push kind: {kind!r}")
