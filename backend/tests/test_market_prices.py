"""Real shop prices on the estimate: what is trusted, what is dropped, and that nothing breaks."""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.config import settings
from app.services import market_prices as mp
from app.services.llm import BudgetExceededError
from app.services.smeta import ComputedEstimate, ComputedLine, recompute_totals
from tests.test_estimate_router import _Result, _as, _db, _material, _norm, _room, _user, client  # noqa: F401

QUOTE = mp.MarketQuote(price_uzs=70_000, store="Stroy Master", url="https://shop.uz/p/1", checked_at="2026-10-05")


def line(category="suvoq", price=65_000, qty=2, label="Suvoq 30 kg", **kw) -> ComputedLine:
    return ComputedLine(label=label, formula="f", qty=qty, unit="qop", unit_price_uzs=price,
                        subtotal_uzs=int(qty * price), category=category, is_approximate=True,
                        warning="norma topilmadi", **kw)


def est(*lines) -> ComputedEstimate:
    return recompute_totals(list(lines))


@pytest.fixture
def on(monkeypatch):
    monkeypatch.setattr(settings, "MARKET_PRICES_ENABLED", True)
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "k")


class TestParseQuote:
    def test_reads_a_well_formed_answer(self):
        q = mp._parse_quote('{"price_uzs": 70000, "store": "Stroy", "url": "https://a.uz/x"}')
        assert (q.price_uzs, q.store, q.url) == (70_000, "Stroy", "https://a.uz/x")

    def test_tolerates_a_code_fence_and_float_price(self):
        q = mp._parse_quote('```json\n{"price_uzs": 70000.0, "store": "S", "url": "http://a.uz"}\n```')
        assert q.price_uzs == 70_000

    @pytest.mark.parametrize("raw", [
        '{"price_uzs": null, "store": "S", "url": "https://a.uz"}',     # not found
        '{"price_uzs": 0, "store": "S", "url": "https://a.uz"}',
        '{"price_uzs": 5, "store": "S", "url": ""}',                    # no page behind it
        '{"price_uzs": 5, "store": "S", "url": "javascript:alert(1)"}',  # not a web page
        '{"price_uzs": 5, "store": "", "url": "https://a.uz"}',
        "narxi 70000 so'm", "", "{bad json}",
    ])
    def test_drops_anything_without_a_price_and_a_real_page(self, raw):
        assert mp._parse_quote(raw) is None


class TestPlausible:
    def test_close_to_the_catalog_price_passes(self):
        assert mp.plausible(QUOTE, 65_000)

    def test_far_off_either_way_is_rejected(self):
        assert not mp.plausible(mp.MarketQuote(300_000, "S", "https://a.uz", "d"), 65_000)
        assert not mp.plausible(mp.MarketQuote(10_000, "S", "https://a.uz", "d"), 65_000)

    def test_no_catalog_price_to_compare_accepts_any_positive(self):
        assert mp.plausible(QUOTE, 0)


class TestApply:
    async def test_reprices_a_searchable_line_and_keeps_the_totals_consistent(self, on):
        searcher = AsyncMock(return_value=QUOTE)
        out, checked, updated = await mp.apply_market_prices(est(line()), user_id="u", searcher=searcher)
        ln = out.lines[0]
        assert (checked, updated) == (1, 1)
        assert ln.unit_price_uzs == 70_000 and ln.subtotal_uzs == 140_000
        assert (ln.price_source, ln.store_name, ln.source_url) == ("market", "Stroy Master", "https://shop.uz/p/1")
        assert ln.is_approximate is False and ln.warning is None
        assert out.total_uzs == 140_000 and out.total_approx_uzs == 0

    async def test_does_not_mutate_the_input(self, on):
        original = est(line())
        await mp.apply_market_prices(original, user_id="u", searcher=AsyncMock(return_value=QUOTE))
        assert original.lines[0].unit_price_uzs == 65_000 and original.lines[0].price_source is None

    async def test_electrics_furniture_and_zero_quantity_are_not_searched(self, on):
        searcher = AsyncMock(return_value=QUOTE)
        e = est(line("elektr"), line("jihoz"), line("chiroq"), line("boyoq", qty=0))
        out, checked, _ = await mp.apply_market_prices(e, user_id="u", searcher=searcher)
        assert checked == 0 and out is e
        searcher.assert_not_called()

    async def test_an_implausible_price_leaves_the_line_alone(self, on):
        far = mp.MarketQuote(900_000, "S", "https://a.uz", "d")
        out, checked, updated = await mp.apply_market_prices(est(line()), user_id="u", searcher=AsyncMock(return_value=far))
        assert (checked, updated) == (1, 0)
        assert out.lines[0].price_source is None and out.lines[0].unit_price_uzs == 65_000

    async def test_a_search_that_finds_nothing_or_raises_leaves_the_line_alone(self, on):
        for searcher in (AsyncMock(return_value=None), AsyncMock(side_effect=RuntimeError("boom"))):
            out, _, updated = await mp.apply_market_prices(
                est(line(label=f"x{uuid.uuid4()}")), user_id=str(uuid.uuid4()), searcher=searcher)
            assert updated == 0 and out.lines[0].unit_price_uzs == 65_000

    async def test_one_failing_line_does_not_stop_the_others(self, on):
        async def searcher(name, unit):
            if name == "bad":
                raise RuntimeError("x")
            return QUOTE
        out, _, updated = await mp.apply_market_prices(
            est(line(label="bad"), line("grunt", label="good")), user_id="u", searcher=searcher)
        assert updated == 1 and out.lines[1].price_source == "market" and out.lines[0].price_source is None

    async def test_a_found_price_is_cached_and_not_searched_again(self, on):
        searcher = AsyncMock(return_value=QUOTE)
        e = est(line(label="Cached material"))
        await mp.apply_market_prices(e, user_id="u1", searcher=searcher)
        out, _, updated = await mp.apply_market_prices(e, user_id="u2", searcher=searcher)
        assert searcher.await_count == 1 and updated == 1 and out.lines[0].unit_price_uzs == 70_000

    async def test_a_miss_is_cached_too(self, on):
        searcher = AsyncMock(return_value=None)
        e = est(line(label="Unfindable"))
        await mp.apply_market_prices(e, user_id="u1", searcher=searcher)
        await mp.apply_market_prices(e, user_id="u2", searcher=searcher)
        assert searcher.await_count == 1

    async def test_caps_the_lines_searched(self, on, monkeypatch):
        monkeypatch.setattr(settings, "MARKET_PRICE_MAX_LINES", 2)
        searcher = AsyncMock(return_value=None)
        e = est(*[line(label=f"m{i}") for i in range(5)])
        _, checked, _ = await mp.apply_market_prices(e, user_id="u", searcher=searcher)
        assert checked == 2 and searcher.await_count == 2

    async def test_the_daily_limit_raises(self, on, monkeypatch):
        monkeypatch.setattr(settings, "MARKET_PRICES_DAILY_LIMIT", 1)
        searcher = AsyncMock(return_value=None)
        e = est(line())
        await mp.apply_market_prices(e, user_id="limited", searcher=searcher)
        with pytest.raises(BudgetExceededError):
            await mp.apply_market_prices(e, user_id="limited", searcher=searcher)


class TestAvailability:
    def test_off_by_default_and_needs_a_key(self, monkeypatch):
        monkeypatch.setattr(settings, "MARKET_PRICES_ENABLED", False)
        monkeypatch.setattr(settings, "GEMINI_API_KEY", "k")
        assert not mp.market_prices_available()
        monkeypatch.setattr(settings, "MARKET_PRICES_ENABLED", True)
        monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
        assert not mp.market_prices_available()


def _preview_db(room, mat, norms):
    return _db(_Result(one=room), _Result(many=[]), _Result(many=[mat]), _Result(one=None),
               _Result(many=norms), _Result(one=None))


class TestEndpoints:
    def _setup(self, client):
        mat = _material(price_uzs=25_000)
        room = _room(surfaces={"ALL": str(mat.id)})
        _as(_user(), _preview_db(room, mat, [_norm()]))
        return room

    def test_preview_without_market_is_unchanged_and_reports_availability(self, client, monkeypatch):
        monkeypatch.setattr(settings, "MARKET_PRICES_ENABLED", False)
        room = self._setup(client)
        body = client.post(f"/api/v1/rooms/{room.id}/estimate/preview").json()
        assert body["market_prices_available"] is False and body["market_updated"] == 0
        assert all(ln["price_source"] is None for ln in body["lines"])

    def test_market_request_while_the_feature_is_off_is_a_clear_503(self, client, monkeypatch):
        monkeypatch.setattr(settings, "MARKET_PRICES_ENABLED", False)
        room = self._setup(client)
        r = client.post(f"/api/v1/rooms/{room.id}/estimate/preview?market=true")
        assert r.status_code == 503 and "yoqilmagan" in r.json()["detail"]

    def test_market_request_reprices_and_labels_the_lines(self, client, on):
        room = self._setup(client)
        quote = mp.MarketQuote(70_000, "Stroy Master", "https://shop.uz/p/9", "2026-10-05")
        with patch("app.services.market_prices.gemini_search_quote", new=AsyncMock(return_value=quote)):
            r = client.post(f"/api/v1/rooms/{room.id}/estimate/preview?market=true")
        assert r.status_code == 200
        body = r.json()
        assert body["market_prices_available"] is True
        assert body["market_checked"] >= 1 and body["market_updated"] >= 1
        market_lines = [ln for ln in body["lines"] if ln["price_source"] == "market"]
        assert market_lines
        assert all(ln["source_url"] == "https://shop.uz/p/9" and ln["store_name"] == "Stroy Master"
                   and ln["price_checked_at"] == "2026-10-05" for ln in market_lines)
        assert body["total_uzs"] == sum(ln["total_uzs"] for ln in body["lines"])

    def test_a_dead_search_still_returns_a_normal_estimate(self, client, on):
        room = self._setup(client)
        with patch("app.services.market_prices.gemini_search_quote", new=AsyncMock(return_value=None)):
            r = client.post(f"/api/v1/rooms/{room.id}/estimate/preview?market=true")
        assert r.status_code == 200 and r.json()["market_updated"] == 0 and r.json()["lines"]

    def test_out_of_refreshes_is_a_429_with_the_uzbek_message(self, client, on):
        room = self._setup(client)
        with patch("app.routers.estimate.apply_market_prices", new=AsyncMock(side_effect=BudgetExceededError())):
            r = client.post(f"/api/v1/rooms/{room.id}/estimate/preview?market=true")
        assert r.status_code == 429 and "limit" in r.json()["detail"].lower()


class TestPdf:
    def test_market_priced_line_names_its_source_and_a_hostile_store_name_cannot_break_it(self):
        import io
        from types import SimpleNamespace
        from reportlab import rl_config
        from app.routers.estimate import _build_pdf

        rl_config.pageCompression = 0
        ln = line(label="Suvoq 30 kg", price=70_000, price_source="market", store_name="A & B <b>Stroy",
                  source_url="https://x.uz", price_checked_at="2026-10-05")
        pdf = _build_pdf(SimpleNamespace(name="Xona"), est(ln))
        text = pdf.decode("latin-1")
        assert pdf.startswith(b"%PDF") and "Bozor narxi" in text and "05.10.2026" in text
