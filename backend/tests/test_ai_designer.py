"""One sentence in, a whole-room design out: what is accepted and what is dropped."""
from __future__ import annotations

import json
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import settings
from app.services import ai_designer as ad
from app.services import llm

ITEMS = [
    {"id": "uuid-sofa", "name_uz": "Divan", "category": "divan", "room_type": "mehmonxona", "placement": "pol", "footprint_w": 210, "footprint_d": 95},
    {"id": "uuid-bed", "name_uz": "Krovat", "category": "krovat", "room_type": "yotoqxona", "placement": "pol", "footprint_w": 200, "footprint_d": 160},
    {"id": "uuid-plant", "name_uz": "O'simlik", "category": "dekor", "room_type": None, "placement": "pol", "footprint_w": None, "footprint_d": None},
]
LINES, BY_LABEL = ad.furniture_menu(ITEMS, "mehmonxona")
GOOD = {
    "title": "Qorong'i", "summary": "To'q ranglar.",
    "walls": {"main": {"type": "paint", "color": "#2c2c2c"}, "accent": {"wall": "C", "color": "#1a1a1a"}},
    "floor": {"type": "parquet", "pattern": "herringbone", "tint": "#3d2b1f"},
    "lights": [{"type": "chandelier", "zone": "center"}],
    "furniture": [{"id": "F1", "zone": "wall_A"}],
}


WALLS = ["A", "B", "C", "D"]


def plan(wall_ids=WALLS, **changes):
    data = {**GOOD, **changes}
    return ad.validate_plan(data, BY_LABEL, wall_ids)


class TestExtractJson:
    def test_plain_fenced_and_surrounded(self):
        assert ad.extract_json('{"a": 1}') == {"a": 1}
        assert ad.extract_json('```json\n{"a": 1}\n```') == {"a": 1}
        assert ad.extract_json('Mana reja:\n{"a": {"b": 2}}\nTayyor.') == {"a": {"b": 2}}

    @pytest.mark.parametrize("text", ["", "reja yo'q", "{broken", "[1, 2]"])
    def test_nothing_usable_is_an_error(self, text):
        with pytest.raises(ad.DesignError):
            ad.extract_json(text)


class TestFurnitureMenu:
    def test_labels_map_back_to_the_real_ids_and_this_room_type_comes_first(self):
        assert BY_LABEL["F1"]["id"] == "uuid-sofa"  # the living-room sofa, not the bedroom bed
        assert list(BY_LABEL).index("F3") == 2 and BY_LABEL["F3"]["id"] == "uuid-bed"
        assert any("2.1x0.95 m" in line for line in LINES) and all(line.startswith("F") for line in LINES)

    def test_a_long_catalog_is_cut(self):
        many = [{"id": str(i), "name_uz": f"M{i}", "category": "x", "room_type": None, "placement": "pol"} for i in range(200)]
        lines, by = ad.furniture_menu(many, None)
        assert len(lines) == len(by) == ad.MAX_CATALOG_IN_PROMPT


class TestValidate:
    def test_a_good_plan_passes_with_real_furniture_ids(self):
        p = plan()
        assert p.walls["main"] == {"type": "paint", "color": "#2c2c2c"}
        assert p.walls["accent"] == {"wall": "C", "color": "#1a1a1a"}
        assert p.floor == {"type": "parquet", "pattern": "herringbone", "tint": "#3d2b1f"}
        assert p.lights == [{"type": "chandelier", "zone": "center"}]
        assert p.furniture == [{"id": "uuid-sofa", "name": "Divan", "zone": "wall_A"}]
        assert p.warnings == []

    def test_short_hex_and_missing_hash_are_normalised_and_junk_colours_dropped(self):
        assert plan(walls={"main": {"type": "paint", "color": "ABC"}}).walls["main"]["color"] == "#aabbcc"
        p = plan(walls={"main": {"type": "paint", "color": "dark"}})
        assert "main" not in p.walls and p.warnings

    def test_an_invented_furniture_id_light_or_floor_is_dropped_not_applied(self):
        p = plan(
            furniture=[{"id": "F1", "zone": "center"}, {"id": "F99", "zone": "center"}, {"id": "uuid-sofa", "zone": "center"}],
            lights=[{"type": "laser", "zone": "center"}, {"type": "pendant", "zone": "center"}],
            floor={"type": "marble"},
        )
        assert [f["id"] for f in p.furniture] == ["uuid-sofa"]  # a raw id is not a label either
        assert [lt["type"] for lt in p.lights] == ["pendant"]
        assert p.floor is None and len(p.warnings) >= 3

    def test_zones_are_the_rooms_own_wall_ids_and_neighbouring_corners(self):
        assert ad.zones_for(["A", "B", "C", "D"]) == [
            "center", "wall_A", "wall_B", "wall_C", "wall_D", "corner_A_B", "corner_B_C", "corner_C_D", "corner_D_A"]
        assert ad.zones_for(["W1", "W2", "W3"])[-3:] == ["corner_W1_W2", "corner_W2_W3", "corner_W3_W1"]
        assert ad.zones_for([]) == ["center"]

    def test_a_drawn_room_accepts_its_own_walls_and_refuses_a_d_names(self):
        walls = ["W1", "W2", "W3", "W4", "W5"]
        p = ad.validate_plan({
            **GOOD,
            "walls": {"main": {"type": "paint", "color": "#222222"}, "accent": {"wall": "W3", "color": "#111111"}},
            "lights": [{"type": "pendant", "zone": "corner_W2_W3"}, {"type": "bra", "zone": "wall_W4"}, {"type": "downlight", "zone": "wall_A"}],
            "furniture": [{"id": "F1", "zone": "wall_W5"}, {"id": "F2", "zone": "wall_A"}],
        }, BY_LABEL, walls)
        assert p.walls["accent"]["wall"] == "W3"
        assert [(lt["type"], lt["zone"]) for lt in p.lights] == [("pendant", "corner_W2_W3"), ("bra", "wall_W4"), ("downlight", "center")]
        assert [f["zone"] for f in p.furniture] == ["wall_W5", "center"]  # wall_A does not exist in this room

    def test_an_accent_on_a_wall_the_room_does_not_have_is_dropped(self):
        assert "accent" not in ad.validate_plan({**GOOD, "walls": {"main": GOOD["walls"]["main"], "accent": {"wall": "C", "color": "#111"}}}, BY_LABEL, ["W1", "W2", "W3"]).walls

    def test_wall_lights_are_forced_onto_a_wall_and_others_default_to_the_centre(self):
        p = plan(lights=[{"type": "bra", "zone": "center"}, {"type": "pendant", "zone": "nonsense"}, {"type": "bath"}])
        assert [(lt["type"], lt["zone"]) for lt in p.lights] == [("bra", "wall_A"), ("pendant", "center"), ("bath", "wall_A")]

    def test_tile_and_concrete_floors_take_no_pattern_or_tint(self):
        p = plan(floor={"type": "tile", "pattern": "herringbone", "tint": "#112233"})
        assert p.floor == {"type": "tile", "pattern": None, "tint": None}
        assert any("naqsh" in w for w in p.warnings)

    def test_a_tint_on_a_wood_floor_without_a_pattern_gets_the_plain_strip_pattern(self):
        assert plan(floor={"type": "laminate", "pattern": None, "tint": "#553311"}).floor["pattern"] == "wood_strip"

    def test_counts_are_capped(self):
        p = plan(
            lights=[{"type": "downlight", "zone": "center"}] * 12,
            furniture=[{"id": "F1", "zone": "center"}] * 5 + [{"id": "F2", "zone": "center"}] * 5,
        )
        assert len(p.lights) == ad.MAX_LIGHTS
        assert [f["id"] for f in p.furniture].count("uuid-sofa") == ad.MAX_PER_ITEM

    def test_oboy_needs_a_known_pattern_and_both_colours(self):
        ok = plan(walls={"main": {"type": "oboy", "pattern": "damask", "base_color": "#eee", "accent_color": "#d4af37"}}).walls["main"]
        assert ok == {"type": "oboy", "pattern": "damask", "base_color": "#eeeeee", "accent_color": "#d4af37"}
        bad = plan(walls={"main": {"type": "oboy", "pattern": "damask", "base_color": "#eee"}})
        assert "main" not in bad.walls

    def test_nothing_usable_at_all_is_an_error(self):
        with pytest.raises(ad.DesignError):
            ad.validate_plan({"title": "x", "walls": {}, "floor": {"type": "marble"}, "lights": [], "furniture": []}, BY_LABEL, WALLS)


ROOM = {"name": "Xona", "room_type": "mehmonxona", "width": 4.0, "depth": 3.0, "ceiling_h": 2.7,
        "walls": [{"id": "A", "length": 4.0, "openings": ["deraza"]}, {"id": "B", "length": 3.0, "openings": []},
                  {"id": "C", "length": 4.0, "openings": []}, {"id": "D", "length": 3.0, "openings": []}]}


class TestDesignRoom:
    def _reply(self, text):
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=text)])

    async def test_asks_with_the_menu_and_returns_the_checked_plan(self):
        call = AsyncMock(return_value=self._reply("```json\n" + json.dumps(GOOD) + "\n```"))
        with patch("app.services.ai_designer.call_llm", new=call):
            p = await ad.design_room("qorong'i atmosfera", ROOM, ITEMS, user_id="u")
        assert p.furniture[0]["id"] == "uuid-sofa"
        sent = call.await_args.kwargs
        assert sent["model_type"] == "builder" and sent["user_id"] == "u"
        message = sent["messages"][0]["content"]
        assert "qorong'i atmosfera" in message and "F1: Divan" in message and "A 4 m (deraza)" in message and "wall_A" in message and "corner_A_B" in message
        assert "4 x 3 m" in message and "chandelier" in message

    async def test_an_unreadable_answer_is_a_design_error(self):
        with patch("app.services.ai_designer.call_llm", new=AsyncMock(return_value=self._reply("kechirasiz"))):
            with pytest.raises(ad.DesignError):
                await ad.design_room("x", ROOM, ITEMS, user_id="u")


class TestProvider:
    def test_a_gemini_key_alone_selects_geminis_compatible_endpoint(self, monkeypatch):
        monkeypatch.setattr(settings, "OPENAI_BASE_URL", "")
        monkeypatch.setattr(settings, "OPENAI_API_KEY", "placeholder")
        monkeypatch.setattr(settings, "GEMINI_API_KEY", "gem-key")
        monkeypatch.setattr(settings, "AI_MODEL_BUILDER", "gemini-3.1-flash-lite")
        assert llm._provider() == ("gem-key", llm.GEMINI_OPENAI_BASE_URL)

    def test_an_explicit_base_url_or_an_openai_model_keeps_the_openai_settings(self, monkeypatch):
        monkeypatch.setattr(settings, "GEMINI_API_KEY", "gem-key")
        monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-x")
        monkeypatch.setattr(settings, "OPENAI_BASE_URL", "https://proxy.example/v1")
        monkeypatch.setattr(settings, "AI_MODEL_BUILDER", "gemini-3.1-flash-lite")
        assert llm._provider() == ("sk-x", "https://proxy.example/v1")
        monkeypatch.setattr(settings, "OPENAI_BASE_URL", "")
        monkeypatch.setattr(settings, "AI_MODEL_BUILDER", "gpt-4-turbo")
        assert llm._provider() == ("sk-x", None)


# --- the endpoint ----------------------------------------------------------------------
from tests.test_estimate_router import _Result, _as, _db, _room, _user, client  # noqa: E402,F401


def _furniture_row(**kw):
    d = dict(id=uuid.uuid4(), name_uz="Divan", category="divan", room_type="mehmonxona", placement="pol",
             footprint_w=210, footprint_d=95)
    d.update(kw)
    return SimpleNamespace(**d)


class TestEndpoint:
    def _setup(self, client, enabled=True, monkeypatch=None):
        room = _room()
        _as(_user(), _db(_Result(one=room), _Result(many=[_furniture_row()])))
        return room

    def test_returns_the_plan_as_json(self, client, monkeypatch):
        monkeypatch.setattr(settings, "AI_FEATURES_ENABLED", True)
        room = self._setup(client)
        plan = ad.DesignPlan(title="T", walls={"main": {"type": "paint", "color": "#111111"}},
                             furniture=[{"id": "x", "name": "Divan", "zone": "wall_A"}])
        design = AsyncMock(return_value=plan)
        with patch("app.routers.ai.design_room", new=design):
            r = client.post(f"/api/v1/rooms/{room.id}/ai-design", json={"prompt": "qorong'i xona", "room_type": "mehmonxona"})
        assert r.status_code == 200
        body = r.json()
        assert body["title"] == "T" and body["walls"]["main"]["color"] == "#111111" and body["warnings"] == []
        prompt, summary, furniture = design.await_args.args
        assert prompt == "qorong'i xona" and summary["room_type"] == "mehmonxona" and summary["width"] == 4.0
        assert [w["id"] for w in summary["walls"]] == ["A", "B", "C", "D"]
        assert summary["walls"][0]["openings"] == []  # the fixture room has no openings
        assert furniture[0]["name_uz"] == "Divan"

    def test_off_when_ai_features_are_disabled(self, client, monkeypatch):
        monkeypatch.setattr(settings, "AI_FEATURES_ENABLED", False)
        room = self._setup(client)
        r = client.post(f"/api/v1/rooms/{room.id}/ai-design", json={"prompt": "qorong'i"})
        assert r.status_code == 503

    @pytest.mark.parametrize("error, code", [
        (ad.DesignError("AI mos tavsiya topa olmadi"), 422),
        (llm.BudgetExceededError(), 429),
        (RuntimeError("provider down"), 502),
    ])
    def test_each_failure_is_a_clear_status_with_a_message(self, client, monkeypatch, error, code):
        monkeypatch.setattr(settings, "AI_FEATURES_ENABLED", True)
        room = self._setup(client)
        with patch("app.routers.ai.design_room", new=AsyncMock(side_effect=error)):
            r = client.post(f"/api/v1/rooms/{room.id}/ai-design", json={"prompt": "qorong'i"})
        assert r.status_code == code and r.json()["detail"]
        assert "provider down" not in r.json()["detail"]  # an internal error text is not shown to the user

    def test_a_too_short_prompt_is_rejected(self, client, monkeypatch):
        monkeypatch.setattr(settings, "AI_FEATURES_ENABLED", True)
        room = self._setup(client)
        assert client.post(f"/api/v1/rooms/{room.id}/ai-design", json={"prompt": "a"}).status_code == 422


class TestClientBaseUrl:
    def test_an_empty_openai_base_url_env_line_does_not_break_the_client(self, monkeypatch):
        monkeypatch.setenv("OPENAI_BASE_URL", "")
        monkeypatch.setattr(settings, "OPENAI_BASE_URL", "")
        monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
        monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-test")
        monkeypatch.setattr(llm, "_client", None)
        try:
            assert str(llm.get_client().base_url).startswith("https://api.openai.com")
        finally:
            llm._client = None
