"""O'zbekistonning 12 viloyati va ularning tumanlari.

Ported from yoshlar_agentligi's `scripts/seed_regions.py` +
`app/core/constants.py` (TOSHKENT_VILOYATI_DISTRICTS) — that project already
maintains this list for its own regions/districts tables, so it's copied
here rather than re-typed from scratch.

Known gap carried over from the source: Qoraqalpog'iston Respublikasi and
Toshkent shahri (the capital, as its own top-level unit) are not included —
the source project doesn't model them either. Existing Store/Usta.district
values in this app's seed data (Chilonzor, Yunusobod, Sergeli, ...) are
Toshkent shahri's own internal city districts, a different administrative
level than this viloyat/tuman list — the two aren't currently reconciled.
"""
from typing import Final

TOSHKENT_VILOYATI_TUMANLARI: Final[tuple[str, ...]] = (
    # Tumanlar (15)
    "Bekobod tumani", "Bo'ka tumani", "Bo'stonliq tumani", "Chinoz tumani",
    "Qibray tumani", "Ohangaron tumani", "Oqqo'rg'on tumani",
    "O'rta Chirchiq tumani", "Parkent tumani", "Piskent tumani",
    "Quyi Chirchiq tumani", "Yangiyo'l tumani", "Yuqori Chirchiq tumani",
    "Zangiota tumani", "Toshkent tumani",
    # Shaharlar (7)
    "Angren shahri", "Bekobod shahri", "Chirchiq shahri", "Nurafshon shahri",
    "Ohangaron shahri", "Olmaliq shahri", "Yangiyo'l shahri",
)


def _tumanlar(*bases: str) -> tuple[str, ...]:
    return tuple(f"{b} tumani" for b in bases)


# viloyat nomi -> (kod, tumanlar)
UZ_REGIONS: Final[dict[str, tuple[str, tuple[str, ...]]]] = {
    "Andijon viloyati": (
        "AN",
        _tumanlar(
            "Andijon", "Asaka", "Baliqchi", "Bo'z", "Buloqboshi", "Izboskan",
            "Jalaquduq", "Xo'jaobod", "Qo'rg'ontepa", "Marhamat", "Oltinko'l",
            "Paxtaobod", "Ulug'nor", "Shahrixon",
        ),
    ),
    "Buxoro viloyati": (
        "BU",
        _tumanlar(
            "Buxoro", "G'ijduvon", "Jondor", "Kogon", "Olot", "Peshku",
            "Qorako'l", "Qorovulbozor", "Romitan", "Shofirkon", "Vobkent",
        ),
    ),
    "Farg'ona viloyati": (
        "FA",
        _tumanlar(
            "Farg'ona", "Bag'dod", "Beshariq", "Buvayda", "Dang'ara", "Furqat",
            "Qo'shtepa", "Rishton", "So'x", "Toshloq", "Uchko'prik", "Oltiariq",
            "Yozyovon", "Quva", "O'zbekiston",
        ),
    ),
    "Jizzax viloyati": (
        "JI",
        _tumanlar(
            "Jizzax", "Arnasoy", "Baxmal", "Do'stlik", "Forish", "G'allaorol",
            "Sharof Rashidov", "Mirzacho'l", "Paxtakor", "Yangiobod", "Zomin",
            "Zafarobod", "Zarbdor",
        ),
    ),
    "Xorazm viloyati": (
        "XO",
        _tumanlar(
            "Urganch", "Bog'ot", "Gurlan", "Xazorasp", "Xonqa", "Xiva",
            "Qo'shko'pir", "Shovot", "Yangiariq", "Yangibozor",
        ),
    ),
    "Namangan viloyati": (
        "NG",
        _tumanlar(
            "Namangan", "Chortoq", "Chust", "Kosonsoy", "Mingbuloq", "Norin",
            "Pop", "To'raqo'rg'on", "Uchqo'rg'on", "Uychi", "Yangiqo'rg'on",
        ),
    ),
    "Navoiy viloyati": (
        "NW",
        _tumanlar(
            "Navoiy", "Karmana", "Konimex", "Navbahor", "Nurota", "Qiziltepa",
            "Tomdi", "Uchquduq", "Xatirchi",
        ),
    ),
    "Qashqadaryo viloyati": (
        "QA",
        _tumanlar(
            "Qarshi", "Chiroqchi", "Dehqonobod", "G'uzor", "Qamashi", "Kasbi",
            "Kitob", "Koson", "Mirishkor", "Muborak", "Nishon", "Shahrisabz",
            "Yakkabog'",
        ),
    ),
    "Samarqand viloyati": (
        "SA",
        _tumanlar(
            "Samarqand", "Bulung'ur", "Ishtixon", "Jomboy", "Kattaqo'rg'on",
            "Qo'shrabot", "Narpay", "Nurobod", "Oqdaryo", "Payariq",
            "Pastdarg'om", "Paxtachi", "Toyloq", "Urgut",
        ),
    ),
    "Sirdaryo viloyati": (
        "SI",
        _tumanlar(
            "Guliston", "Boyovut", "Mirzaobod", "Oqoltin", "Sardoba",
            "Sayxunobod", "Sirdaryo", "Xovos",
        ),
    ),
    "Surxondaryo viloyati": (
        "SU",
        _tumanlar(
            "Termiz", "Angor", "Bandixon", "Boysun", "Denov", "Jarqo'rg'on",
            "Qiziriq", "Qumqo'rg'on", "Muzrabot", "Oltinsoy", "Sariosiyo",
            "Sherobod", "Sho'rchi", "Uzun",
        ),
    ),
    "Toshkent viloyati": ("TO", TOSHKENT_VILOYATI_TUMANLARI),
}
