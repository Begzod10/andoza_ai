"""The estimate's lines grouped by category: the table, and the PDF that uses it."""
from __future__ import annotations

import re
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services import smeta_groups as sg
from app.services.smeta import ComputedEstimate, ComputedLine


def line(category: str, total: int, label: str | None = None, **kw) -> ComputedLine:
    return ComputedLine(label=label or category, formula="1 x 1", qty=1, unit="dona", unit_price_uzs=total,
                        subtotal_uzs=total, category=category, **kw)


class TestTable:
    def test_every_category_the_engine_can_emit_has_a_group(self):
        # Read straight from the engine's source: a new category added there but not here would
        # silently land in "boshqa" on the page and in the PDF.
        source = (Path(sg.__file__).parent / "smeta.py").read_text()
        emitted = set(re.findall(r'category="(\w+)"', source))
        assert emitted  # the pattern found something
        missing = {c for c in emitted if sg.group_key_for(c) == "boshqa"}
        assert missing == set()

    def test_every_group_has_a_label_and_a_colour(self):
        assert set(sg.GROUP_LABEL) == set(sg.GROUP_ORDER) == set(sg.GROUP_COLOUR)

    @pytest.mark.parametrize("category", ["", None, "mebel", "  ", "xyz"])
    def test_unknown_or_missing_is_boshqa(self, category):
        assert sg.group_key_for(category) == "boshqa"

    def test_case_and_spaces_do_not_matter(self):
        assert sg.group_key_for("  BOYOQ ") == "pardoz"


class TestGrouping:
    def test_fixed_order_empty_groups_left_out(self):
        groups = sg.group_lines([line("jihoz", 1), line("suvoq", 1), line("elektr", 1), line("boyoq", 1)])
        assert [g.key for g in groups] == ["tayyorlash", "pardoz", "elektr", "jihoz"]

    def test_subtotal_and_order_inside_a_group(self):
        groups = sg.group_lines([line("suvoq", 750, "a"), line("boyoq", 1, "x"), line("grunt", 250, "b")])
        prep = groups[0]
        assert prep.subtotal == 1000
        assert [ln.label for ln in prep.lines] == ["a", "b"]
        assert prep.label == "Devorni tayyorlash"

    def test_shares(self):
        assert sg.share(250, 1000) == 0.25
        assert sg.share(5, 0) == 0.0
        assert sg.format_share(0.374) == "37%"
        assert sg.format_share(0.004) == "<1%"
        assert sg.format_share(0) == "0%"

    def test_no_lines(self):
        assert sg.group_lines([]) == []


class TestPdf:
    @pytest.fixture
    def pdf(self, monkeypatch):
        from reportlab import rl_config

        from app.routers import estimate as router

        monkeypatch.setattr(rl_config, "pageCompression", 0)  # so the text can be read back out of the bytes
        est = ComputedEstimate(
            lines=[
                line("jihoz", 4_500_000, "Jihoz: Divan", store_name="Mebel Plaza"),
                line("suvoq", 975_000, "Suvoq 30 kg", is_approximate=True, warning="Norma topilmadi"),
                line("grunt", 90_000, "Grunt 5 kg"),
                line("boyoq", 112_000, "Boyoq oq", store_name="Stroy Master"),
                line("noma'lum", 50_000, "Boshqa ish"),
            ],
            total_uzs=5_727_000, total_min=5_154_300, total_max=6_990_000,
        )
        room = SimpleNamespace(name="Mening xonam")
        return router._build_pdf(room, est)

    def test_is_a_pdf(self, pdf):
        assert pdf.startswith(b"%PDF")

    def test_has_a_section_per_group_in_order_and_none_for_empty_ones(self, pdf):
        text = pdf.decode("latin-1")
        order = ["Devorni tayyorlash", "Devor pardozi", "Mebel va jihozlar", "Boshqa xarajatlar"]
        positions = [text.index(f"{name} ") if f"{name} " in text else text.index(name) for name in order]
        assert positions == sorted(positions)
        assert "Pol va plintus" not in text and "Elektr va yoritish" not in text

    def test_each_group_has_a_subtotal_row(self, pdf):
        text = pdf.decode("latin-1")
        assert "Jami: Devorni tayyorlash" in text
        assert "1 065 000" in text  # 975 000 + 90 000

    def test_opens_with_the_cost_breakdown(self, pdf):
        text = pdf.decode("latin-1")
        assert "Xarajat taqsimoti" in text
        assert text.index("Xarajat taqsimoti") < text.index("Jami: Devorni tayyorlash")  # before any group's own table

    def test_no_longer_groups_by_store_but_keeps_the_store_on_each_line(self, pdf):
        text = pdf.decode("latin-1")
        assert "Do'kon: Mebel Plaza" in text
        assert "Do'kon: Stroy Master" in text
        assert "Boshqa / Umumiy" not in text  # the old catch-all store heading

    def test_keeps_the_totals_and_the_warning(self, pdf):
        text = pdf.decode("latin-1")
        assert "5 727 000" in text
        assert "Norma topilmadi" in text
