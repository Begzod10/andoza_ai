"""Unit tests for app/services/smeta_ai.py — the AI price-gap backfill.

Mocks call_llm and the Redis cache — no real API calls, no real Redis.
"""
from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests-only-32chars!!")
os.environ.setdefault("AI_FEATURES_ENABLED", "true")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.smeta import ComputedEstimate, ComputedLine
from app.services.smeta_ai import estimate_builder_price, fill_ai_price_gaps


def _mock_llm_response(text: str):
    block = MagicMock()
    block.type = "text"
    block.text = text
    response = MagicMock()
    response.content = [block]
    return response


def _texture_line(**overrides) -> ComputedLine:
    defaults = dict(
        label="Devor foto-bosma (individual)",
        formula="10.8 m² (devor A)",
        qty=10.8,
        unit="m²",
        unit_price_uzs=0,
        subtotal_uzs=0,
        category="texture",
        is_approximate=True,
        warning="Narx aniqlanmoqda — AI orqali taxminiy narx so'ralmoqda.",
        needs_ai_price=True,
        ai_price_context="Individual foto-oboy, 10.8 m² uchun",
    )
    defaults.update(overrides)
    return ComputedLine(**defaults)


# ---------------------------------------------------------------------------
# estimate_builder_price
# ---------------------------------------------------------------------------

class TestEstimateBuilderPrice:
    async def test_cache_hit_skips_the_llm_call(self):
        with patch(
            "app.services.smeta_ai.cache_get",
            new=AsyncMock(return_value={"price_uzs": 150_000, "note": "Bozor narxi"}),
        ), patch("app.services.smeta_ai.call_llm", new=AsyncMock()) as llm:
            result = await estimate_builder_price("Individual foto-oboy, 10 m²", "m²")

        assert result == (150_000, "Bozor narxi")
        llm.assert_not_called()

    async def test_cache_miss_calls_llm_parses_and_caches(self):
        response = _mock_llm_response('{"narx_som": 180000, "izoh": "O\'rtacha bozor narxi"}')
        cache_set = AsyncMock()
        with patch("app.services.smeta_ai.cache_get", new=AsyncMock(return_value=None)), \
             patch("app.services.smeta_ai.cache_set", new=cache_set), \
             patch("app.services.smeta_ai.call_llm", new=AsyncMock(return_value=response)):
            result = await estimate_builder_price("Individual foto-oboy, 10 m²", "m²")

        assert result == (180_000, "O'rtacha bozor narxi")
        cache_set.assert_awaited_once()
        cached_key, cached_value = cache_set.call_args.args[0], cache_set.call_args.args[1]
        assert cached_value == {"price_uzs": 180_000, "note": "O'rtacha bozor narxi"}
        assert isinstance(cached_key, str)

    async def test_markdown_fenced_json_still_parses(self):
        response = _mock_llm_response('```json\n{"narx_som": 90000, "izoh": "Arzon variant"}\n```')
        with patch("app.services.smeta_ai.cache_get", new=AsyncMock(return_value=None)), \
             patch("app.services.smeta_ai.cache_set", new=AsyncMock()), \
             patch("app.services.smeta_ai.call_llm", new=AsyncMock(return_value=response)):
            result = await estimate_builder_price("X", "m²")

        assert result == (90_000, "Arzon variant")

    async def test_unparseable_response_returns_none(self):
        response = _mock_llm_response("Kechirasiz, bila olmadim.")
        with patch("app.services.smeta_ai.cache_get", new=AsyncMock(return_value=None)), \
             patch("app.services.smeta_ai.call_llm", new=AsyncMock(return_value=response)):
            result = await estimate_builder_price("X", "m²")

        assert result is None

    async def test_zero_or_negative_price_returns_none(self):
        response = _mock_llm_response('{"narx_som": 0, "izoh": "Bepul"}')
        with patch("app.services.smeta_ai.cache_get", new=AsyncMock(return_value=None)), \
             patch("app.services.smeta_ai.call_llm", new=AsyncMock(return_value=response)):
            result = await estimate_builder_price("X", "m²")

        assert result is None

    async def test_llm_failure_returns_none_not_raise(self):
        """BudgetExceededError, AI-disabled RuntimeError, a network error —
        none of these should ever propagate out of this function."""
        with patch("app.services.smeta_ai.cache_get", new=AsyncMock(return_value=None)), \
             patch("app.services.smeta_ai.call_llm", new=AsyncMock(side_effect=RuntimeError("AI features are disabled"))):
            result = await estimate_builder_price("X", "m²")

        assert result is None


# ---------------------------------------------------------------------------
# fill_ai_price_gaps
# ---------------------------------------------------------------------------

class TestFillAiPriceGaps:
    async def test_no_gaps_returns_unchanged(self):
        est = ComputedEstimate(
            lines=[
                ComputedLine(
                    label="Elektr kabel", formula="", qty=10, unit="m",
                    unit_price_uzs=10_000, subtotal_uzs=100_000, category="elektr",
                )
            ],
            total_exact_uzs=100_000, total_approx_uzs=0, total_uzs=100_000,
            total_min=90_000, total_max=110_000,
        )
        with patch("app.services.smeta_ai.estimate_builder_price", new=AsyncMock()) as est_price:
            result = await fill_ai_price_gaps(est)

        est_price.assert_not_called()
        assert result is est

    async def test_backfills_price_and_recomputes_totals(self):
        texture = _texture_line()
        elektr = ComputedLine(
            label="Elektr kabel", formula="", qty=10, unit="m",
            unit_price_uzs=10_000, subtotal_uzs=100_000, category="elektr",
        )
        est = ComputedEstimate(
            lines=[elektr, texture],
            total_exact_uzs=100_000, total_approx_uzs=0, total_uzs=100_000,
            total_min=90_000, total_max=110_000,
        )
        with patch(
            "app.services.smeta_ai.estimate_builder_price",
            new=AsyncMock(return_value=(200_000, "O'rtacha narx")),
        ):
            result = await fill_ai_price_gaps(est, user_id="u1")

        filled = next(ln for ln in result.lines if ln.category == "texture")
        assert filled.needs_ai_price is False
        assert filled.unit_price_uzs == 200_000
        assert filled.subtotal_uzs == round(10.8 * 200_000)
        assert filled.is_approximate is True
        assert "AI taxminiy narx" in filled.warning
        assert "O'rtacha narx" in filled.warning

        # Totals must reflect the backfilled price, not the original 0.
        assert result.total_uzs == 100_000 + filled.subtotal_uzs
        assert result.total_approx_uzs == filled.subtotal_uzs

        # The untouched line must survive as-is.
        untouched = next(ln for ln in result.lines if ln.category == "elektr")
        assert untouched.subtotal_uzs == 100_000

    async def test_ai_failure_leaves_line_untouched(self):
        texture = _texture_line()
        est = ComputedEstimate(
            lines=[texture],
            total_exact_uzs=0, total_approx_uzs=0, total_uzs=0,
            total_min=0, total_max=0,
        )
        with patch("app.services.smeta_ai.estimate_builder_price", new=AsyncMock(return_value=None)):
            result = await fill_ai_price_gaps(est)

        line = result.lines[0]
        assert line.needs_ai_price is True
        assert line.unit_price_uzs == 0
        assert line.warning == "Narx aniqlanmoqda — AI orqali taxminiy narx so'ralmoqda."
        assert result.total_uzs == 0

    async def test_multiple_gaps_each_priced_independently(self):
        a = _texture_line(qty=5.0, ai_price_context="Photo A")
        b = _texture_line(qty=8.0, ai_price_context="Photo B")
        est = ComputedEstimate(
            lines=[a, b],
            total_exact_uzs=0, total_approx_uzs=0, total_uzs=0,
            total_min=0, total_max=0,
        )

        async def _fake_price(description, unit, *, user_id=None):
            return (100_000, "narx") if description == "Photo A" else (300_000, "narx")

        with patch("app.services.smeta_ai.estimate_builder_price", new=AsyncMock(side_effect=_fake_price)):
            result = await fill_ai_price_gaps(est)

        prices = sorted(ln.unit_price_uzs for ln in result.lines)
        assert prices == [100_000, 300_000]
