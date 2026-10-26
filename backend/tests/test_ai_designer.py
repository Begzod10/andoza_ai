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

@pytest.fixture(autouse=True)
def _keep_catalog_order(monkeypatch):
    """The menu is shuffled in production; the tests refer to F1, F2... by position."""
    monkeypatch.setattr("app.services.ai_designer.random.shuffle", lambda items: None)


ITEMS = [
    {"id": "uuid-sofa", "name_uz": "Divan", "category": "divan", "room_type": "mehmonxona", "placement": "pol", "footprint_w": 210, "footprint_d": 95},
    {"id": "uuid-bed", "name_uz": "Krovat", "category": "krovat", "room_type": "yotoqxona", "placement": "pol", "footprint_w": 200, "footprint_d": 160},
    {"id": "uuid-plant", "name_uz": "O'simlik", "category": "dekor", "room_type": None, "placement": "pol", "footprint_w": None, "footprint_d": None},
]
with patch("app.services.ai_designer.random.shuffle", lambda items: None):
    LINES, BY_LABEL = ad.furniture_menu(ITEMS, "mehmonxona")
GOOD = {
    "title": "Qorong'i", "summary": "To'q ranglar.",
    "walls": {"main": {"type": "paint", "color": "#2c2c2c"}, "accent": {"wall": "C", "color": "#1a1a1a"}},
    "floor": {"type": "parquet", "pattern": "herringbone", "tint": "#3d2b1f"},
    "lights": [{"type": "chandelier", "zone": "center"}],
    "furniture": [{"id": "F1", "role": "sofa"}],
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
        assert p.furniture == [{"id": "uuid-sofa", "name": "Divan", "role": "sofa"}]
        assert p.warnings == []

    def test_short_hex_and_missing_hash_are_normalised_and_junk_colours_dropped(self):
        assert plan(walls={"main": {"type": "paint", "color": "ABC"}}).walls["main"]["color"] == "#aabbcc"
        p = plan(walls={"main": {"type": "paint", "color": "dark"}})
        assert "main" not in p.walls and p.warnings

    def test_an_invented_furniture_id_light_or_floor_is_dropped_not_applied(self):
        p = plan(
            furniture=[{"id": "F1", "role": "sofa"}, {"id": "F99", "role": "sofa"}, {"id": "uuid-sofa", "role": "sofa"}],
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
            "furniture": [{"id": "F1", "role": "sofa"}, {"id": "F2", "role": "bed"}],
        }, BY_LABEL, walls)
        assert p.walls["accent"]["wall"] == "W3"
        assert [(lt["type"], lt["zone"]) for lt in p.lights] == [("pendant", "corner_W2_W3"), ("bra", "wall_W4"), ("downlight", "center")]
        assert [f["role"] for f in p.furniture] == ["sofa", "bed"]

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
        ids = [f["id"] for f in p.furniture]
        assert ids.count("uuid-sofa") == 1  # a room has one sofa
        assert ids.count("uuid-plant") == ad.MAX_PER_ITEM

    def test_oboy_needs_a_known_pattern_and_both_colours(self):
        ok = plan(walls={"main": {"type": "oboy", "pattern": "damask", "base_color": "#eee", "accent_color": "#d4af37"}}).walls["main"]
        assert ok == {"type": "oboy", "pattern": "damask", "base_color": "#eeeeee", "accent_color": "#d4af37"}
        bad = plan(walls={"main": {"type": "oboy", "pattern": "damask", "base_color": "#eee"}})
        assert "main" not in bad.walls

    def test_image_notes_are_kept_as_text_and_clipped(self):
        assert plan(image_notes="  Rasmda kamin bor  ").image_notes == "Rasmda kamin bor"
        assert plan(image_notes={"x": 1}).image_notes == ""
        assert len(plan(image_notes="a" * 2000).image_notes) <= 600
        assert plan().image_notes == ""

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

    # ── with an inspiration image ──────────────────────────────────────────

    def _image(self):
        from app.services.design_image import PreparedImage
        return PreparedImage("image/jpeg", "QUJD", 10, 10)

    async def test_with_an_image_the_model_gets_the_picture_and_the_image_instructions(self):
        call = AsyncMock(return_value=self._reply(json.dumps(GOOD)))
        with patch("app.services.ai_designer.call_llm", new=call):
            await ad.design_room("faqat ranglarini ol", ROOM, ITEMS, user_id="u", image=self._image())
        sent = call.await_args.kwargs
        content = sent["messages"][0]["content"]
        assert content[0] == {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": "QUJD"}}
        text = content[1]["text"]
        assert "faqat ranglarini ol" in text and ad._IMAGE_INSTRUCTIONS in text and "F1: Divan" in text
        assert sent["user_id"] is None  # the router counts it, in its own pool

    async def test_with_an_image_and_no_prompt_the_default_prompt_is_used(self):
        call = AsyncMock(return_value=self._reply(json.dumps(GOOD)))
        with patch("app.services.ai_designer.call_llm", new=call):
            await ad.design_room("", ROOM, ITEMS, user_id="u", image=self._image())
        assert ad._IMAGE_DEFAULT_PROMPT in call.await_args.kwargs["messages"][0]["content"][1]["text"]

    async def test_an_image_plan_is_checked_like_any_other(self):
        invented = {**GOOD, "furniture": [{"id": "F1", "zone": "wall_A"}, {"id": "F99", "zone": "center"}]}
        with patch("app.services.ai_designer.call_llm", new=AsyncMock(return_value=self._reply(json.dumps(invented)))):
            p = await ad.design_room("", ROOM, ITEMS, user_id="u", image=self._image())
        assert [f["id"] for f in p.furniture] == ["uuid-sofa"]

    async def test_what_the_image_had_and_the_catalog_lacked_survives_the_summary_check(self):
        # Final review: the model said in summary what it took from the picture and what
        # the catalog lacked; reconcile_summary saw colours/kinds not in the plan and
        # replaced the whole summary. Those notes now travel in image_notes, untouched.
        notes = "Rasmda kamin va zaytun rangli devor bor edi, katalogda kamin yo'q."
        reply = {**GOOD, "image_notes": notes}
        with patch("app.services.ai_designer.call_llm", new=AsyncMock(return_value=self._reply(json.dumps(reply)))):
            p = await ad.design_room("", ROOM, ITEMS, user_id="u", image=self._image())
        assert p.image_notes == notes
        assert "image_notes" in ad._IMAGE_INSTRUCTIONS

    async def test_a_photo_alone_gets_no_room_type_plan(self):
        # The photo is the style: the room type's suggestion would pull the design away from it.
        call = AsyncMock(return_value=self._reply(json.dumps({**GOOD, "trim": {"ceiling": "flat"}})))
        with patch("app.services.ai_designer.call_llm", new=call):
            p = await ad.design_room("", ROOM, ITEMS, user_id="u", image=self._image())
        text = call.await_args.kwargs["messages"][0]["content"][1]["text"]
        assert "Boshlang'ich reja" not in text
        for line in NO_STYLE_LINES:
            assert line in text
        assert p.trim["ceiling"] == {"design": "flat"}  # not zamonaviy's ceiling settings
        assert "Xona: Xona (mehmonxona)" in text  # the room is still named by its type

    async def test_a_photo_does_not_reorder_the_menu_by_the_room_type_s_style(self):
        items = [_styled("modern", ["zamonaviy"], "yotoqxona"), _styled("scandi", ["skandinav"], "yotoqxona")]
        call = AsyncMock(return_value=self._reply(json.dumps(GOOD)))
        with patch("app.services.ai_designer.call_llm", new=call):
            await ad.design_room("Shinam yotoqxona", {**ROOM, "room_type": "yotoqxona"}, items, user_id="u",
                                 image=self._image())
        assert "F1: Divan modern" in call.await_args.kwargs["messages"][0]["content"][1]["text"]

    async def test_a_photo_with_a_named_style_keeps_its_strict_plan(self):
        call = AsyncMock(return_value=self._reply(json.dumps(GOOD)))
        with patch("app.services.ai_designer.call_llm", new=call):
            await ad.design_room("loft", ROOM, ITEMS, user_id="u", image=self._image())
        text = call.await_args.kwargs["messages"][0]["content"][1]["text"]
        assert "Boshlang'ich reja (Loft)" in text and STARTING_PLAN_RULE in text

    async def test_without_an_image_nothing_changes(self):
        call = AsyncMock(return_value=self._reply(json.dumps(GOOD)))
        with patch("app.services.ai_designer.call_llm", new=call):
            await ad.design_room("qorong'i xona", ROOM, ITEMS, user_id="u")
        sent = call.await_args.kwargs
        assert isinstance(sent["messages"][0]["content"], str) and sent["user_id"] == "u"

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
             footprint_w=210, footprint_d=95, styles=[])
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
                             furniture=[{"id": "x", "name": "Divan", "role": "sofa"}])
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


def test_furniture_budget_grows_with_the_room():
    from app.services.ai_designer import furniture_budget

    assert furniture_budget(3.5) == (1, 2)
    assert furniture_budget(10) == (4, 5)
    assert furniture_budget(30)[1] == 8
    highs = [furniture_budget(a)[1] for a in (3, 5, 8, 12, 18, 30)]
    assert highs == sorted(highs)


def test_validate_plan_caps_furniture_and_drops_lights_sold_as_furniture():
    from app.services.ai_designer import validate_plan

    by_label = {
        "F1": {"id": "a", "name": "Divan"}, "F2": {"id": "b", "name": "Torsher"},
        "F3": {"id": "c", "name": "Stol"}, "F4": {"id": "d", "name": "Kreslo"},
    }
    data = {
        "walls": {"main": {"type": "paint", "color": "#ffffff"}},
        "lights": [{"type": "floor_lamp", "zone": "center"}],
        "furniture": [{"id": l, "zone": "center"} for l in ("F1", "F2", "F3", "F4")],
    }
    plan = validate_plan(data, by_label, ["A", "B", "C", "D"], max_furniture=2)
    assert [f["name"] for f in plan.furniture] == ["Divan", "Stol"]


def test_a_second_sofa_or_a_light_sold_as_furniture_is_dropped_but_other_pieces_stay():
    from app.services.ai_designer import validate_plan

    by_label = {
        "F1": {"id": "a", "name": "Divan A", "category": "divan"},
        "F2": {"id": "b", "name": "Divan B", "category": "divan"},
        "F3": {"id": "c", "name": "Stol", "category": "stol"},
        "F4": {"id": "d", "name": "Polga lampa", "category": "lampa"},
    }
    data = {
        "walls": {"main": {"type": "paint", "color": "#ffffff"}},
        "lights": [{"type": "ceiling", "zone": "center"}],
        "furniture": [{"id": l, "zone": "center"} for l in ("F1", "F2", "F3", "F4")],
    }
    plan = validate_plan(data, by_label, ["A", "B", "C", "D"])
    assert [f["name"] for f in plan.furniture] == ["Divan A", "Stol"]


def test_the_menu_leaves_out_other_rooms_pieces_once_enough_fit_this_one():
    items = [
        {"id": f"l{n}", "name_uz": f"Zal {n}", "category": "stol", "room_type": "mehmonxona", "placement": "pol"}
        for n in range(8)
    ] + [{"id": "b", "name_uz": "Karavot", "category": "karavot", "room_type": "yotoqxona", "placement": "pol"}]
    lines, by_label = ad.furniture_menu(items, "mehmonxona")
    assert len(by_label) == 8 and not any("Karavot" in line for line in lines)
    # too few fit: the rest are offered so the model has something to choose from
    lines, by_label = ad.furniture_menu(items[:3] + items[-1:], "mehmonxona")
    assert len(by_label) == 4


def test_lamps_are_not_offered_as_furniture():
    items = [
        {"id": "t", "name_uz": "Torsher", "category": "lampa", "room_type": None, "placement": "pol"},
        {"id": "s", "name_uz": "Divan", "category": "divan", "room_type": None, "placement": "pol"},
    ]
    _, by_label = ad.furniture_menu(items, "mehmonxona")
    assert [v["name"] for v in by_label.values()] == ["Divan"]


# --- furniture styles -------------------------------------------------------------------

def _styled(id_, styles, room_type="mehmonxona"):
    return {"id": id_, "name_uz": f"Divan {id_}", "category": "divan", "room_type": room_type,
            "placement": "pol", "styles": styles}


def test_the_menu_shows_a_piece_s_styles_and_leaves_unstyled_lines_as_they_were():
    lines, _ = ad.furniture_menu([_styled("a", ["zamonaviy", "hitech"]), _styled("b", [])], "mehmonxona")
    assert lines[0] == "F1: Divan a (divan, polga, uslub: Zamonaviy, Hi-Tech)"
    assert lines[1] == "F2: Divan b (divan, polga)"


@pytest.mark.parametrize(("prompt", "wanted"), [
    ("Hi-Tech uslubida mehmonxona", {"hitech"}),
    ("hitech, qora va oq", {"hitech"}),
    ("Neoklassika, och bej", {"neoklassika"}),
    ("klassik uslub, oltin detallar", {"klassik"}),
    ("milliy uslub, gilam", {"milliy"}),
    ("o‘zbekona", {"milliy"}), ("oʼzbekona", {"milliy"}), ("o`zbekona", {"milliy"}),
    ("zamonaviy va loft aralash", {"zamonaviy", "loft"}),
    ("Skandinav, yorug'", {"skandinav"}),
    ("minimalist oq xona", {"minimalist"}),
    ("qorong'i, iliq atmosfera", set()),
])
def test_styles_named_in_the_request_are_recognised(prompt, wanted):
    assert ad.styles_in_prompt(prompt) == wanted


def test_pieces_of_the_requested_style_come_first_among_those_that_fit_the_room():
    items = [_styled("plain", []), _styled("loft", ["loft"]), _styled("other-room", ["hitech"], "yotoqxona"),
             _styled("hi", ["hitech"])]
    _, by_label = ad.furniture_menu(items, "mehmonxona", "hi-tech uslubida")
    assert [v["id"] for v in by_label.values()][:1] == ["hi"]
    # the room still comes first: the hitech piece for another room is not ahead of this room's pieces
    order = [v["id"] for v in by_label.values()]
    assert order.index("other-room") > order.index("plain")


def test_without_a_style_in_the_request_the_order_is_as_before():
    items = [_styled("plain", []), _styled("hi", ["hitech"])]
    _, by_label = ad.furniture_menu(items, "mehmonxona", "iliq va yorug'")
    assert [v["id"] for v in by_label.values()] == ["plain", "hi"]


def test_the_designer_is_told_to_prefer_the_requested_style():
    assert "Uslubi yozilmagan mebel hamma uslubga mos" in ad._SYSTEM


def test_the_endpoint_hands_the_designer_each_piece_s_styles(client):
    _as(_user(), _db(_Result(one=_room()), _Result(many=[_furniture_row(styles=["loft"])])))
    with patch.object(settings, "AI_FEATURES_ENABLED", True), \
         patch("app.routers.ai.design_room", new=AsyncMock(return_value=ad.DesignPlan(title="t", summary="s", walls={"main": {"type": "paint", "color": "#ffffff"}}))) as design:
        client.post(f"/api/v1/rooms/{uuid.uuid4()}/ai-design", json={"prompt": "loft uslubi"})
    assert design.await_args.args[2][0]["styles"] == ["loft"]


@pytest.mark.parametrize("category,name,role", [
    ("boshqa", "Jun gilam", "rug"), ("stol", "Jurnal stoli", "coffee_table"),
    ("boshqa", "TV tumba", "tv_unit"), ("stol", "Tumbochka", "nightstand"),
    ("stol", "Yozuv stoli", "desk"), ("divan", "Kreslo Milano", "armchair"),
    ("shkaf", "Garderob", "wardrobe"), ("shkaf", "Kitob javoni", "shelf"),
    ("divan", "Divan Roma", "sofa"), ("karavot", "Karavot", "bed"),
    ("stol", "Ovqat stoli", "dining_table"), ("stul", "Stul", "dining_chair"),
    ("boshqa", "Puf", "decor"),
    ("stul", "Ish stuli", "desk_chair"), ("stul", "Office chair", "desk_chair"),
    ("kreslo", "Kompyuter stuli", "desk_chair"), ("stul", "Офисное кресло", "desk_chair"),
    ("divan", "Kreslo", "armchair"),
    ("stol", "Компьютерный стол", "desk"), ("kreslo", "Компьютерное кресло", "desk_chair"),
    ("stul", "Офисный стул", "desk_chair"),
    # "ovqatlanish" ends in "ish": a dining chair or table is not a desk chair or desk
    ("stul", "KLEIN ovqatlanish stuli", "dining_chair"), ("stol", "NARVI ovqatlanish stoli — oq", "dining_table"),
    ("stul", "Ish stuli Pro", "desk_chair"), ("stol", "Ish stoli", "desk"),
])
def test_infer_role(category, name, role):
    assert ad.infer_role(category, name) == role


def test_validate_plan_keeps_a_known_role():
    p = plan(furniture=[{"id": "F3", "role": "sofa"}])  # F3 is a bed by name, the model's role wins
    assert p.furniture[0]["role"] == "sofa"


@pytest.mark.parametrize("raw", [{"id": "F1", "role": "throne"}, {"id": "F1"}])
def test_validate_plan_infers_a_bad_or_missing_role(raw):
    p = plan(furniture=[raw])
    assert p.furniture[0]["role"] == ad.infer_role("divan", "Divan") == "sofa"


def test_validate_plan_ignores_old_zone():
    p = plan(furniture=[{"id": "F1", "zone": "wall_A"}])
    assert p.furniture[0]["role"] == "sofa" and "zone" not in p.furniture[0]


def test_prompt_lists_roles():
    assert len(ad.FURNITURE_ROLES) == 14
    for role in ad.FURNITURE_ROLES:
        assert role in ad._SYSTEM


# --- start from the style's preset, gold/light lines, trim, room-type menu ----------------------

STARTING_PLAN_RULE = (
    "Shu rejadan boshlang. So'rovda aniq aytilgan narsalarni o'zgartiring, qolganini saqlang. "
    "Pol turi va naqshini, chiroq turlarini sababsiz almashtirmang."
)
NO_STYLE_LINES = (
    "Pol turini xona turi va atmosferaga qarab tanlang, har doim parket emas: oshxona va hammomda plitka, "
    "loft yoki sanoat ruhida beton.",
    "Qandil faqat klassik va neoklassik ruhda.",
    "So'ralmagan accent devor qo'ymang.",
)
GOLD_LINE = "Oltin talab qilingan: aksent yoki oboy accent_color uchun haqiqiy oltin tus (#C9A24B yoki #B8860B)"
LIGHT_LINE = "Aksent ham och va asosiy rangga yaqin bo'lsin"


def _message(prompt, room=None):
    return ad.build_user_message(prompt, room or ROOM, "chandelier (Qandil)", LINES)


def test_style_prompt_embeds_starting_plan():
    from app.services.design_presets import load_presets
    message = _message("Loft, g'isht va qora metall")
    assert "Boshlang'ich reja (Loft)" in message
    assert STARTING_PLAN_RULE in message
    loft = load_presets()["loft"]
    assert json.dumps(loft["floor"], ensure_ascii=False) in message  # concrete, no pattern
    assert '"ceiling": "non_drop"' in message  # the preset's trim, as the profile ids the model answers with


def test_two_styles_use_first():
    message = _message("loft va minimalist")
    assert message.count("Boshlang'ich reja") == 1
    assert "Boshlang'ich reja (Loft)" in message


def test_no_style_gets_general_guidance():
    message = _message("iliq, sokin atmosfera", {**ROOM, "room_type": None})
    for line in NO_STYLE_LINES:
        assert line in message
    assert "Boshlang'ich reja" not in message
    assert STARTING_PLAN_RULE not in message


# --- a room type's own starting style when the request names none ---------------------------------

SOFT_PLAN_RULE = (
    "Uslub aytilmagan: quyidagi reja xona turiga qarab taklif qilingan boshlang'ich nuqta, xolos. "
    "So'rovdagi rang, atmosfera va material istaklari (masalan iliq ranglar, yorqin, to'q, yog'och) undan ustun: "
    "devor, pol va ranglarni shularga moslab o'zgartiring. So'rovda aytilmagan narsalarda shu rejaga tayaning."
)


def _plan_label(message):
    return message.split("Boshlang'ich reja (", 1)[1].split(")", 1)[0]


def _plan_in(message):
    return json.loads(message.split("Boshlang'ich reja", 1)[1].split("\n")[1])


# Not the style's name: the model would write "Zamonaviy uslubda" for a request that named no style.
ROOM_TYPE_LABEL = "xona turi uchun taklif"


def test_a_cosy_bedroom_starts_from_the_scandinavian_plan_with_the_soft_rule():
    message = _message("Shinam yotoqxona", {**ROOM, "room_type": "yotoqxona"})
    assert _plan_label(message) == ROOM_TYPE_LABEL
    assert _plan_in(message)["floor"]["tint"] == "#d2b48c"  # skandinav's light laminate
    assert "Skandinav" not in message
    assert SOFT_PLAN_RULE in message
    assert STARTING_PLAN_RULE not in message and "sababsiz" not in message


def test_a_room_type_s_plan_gives_way_to_the_request_s_colours():
    message = _message("Iliq ranglar")  # ROOM is a mehmonxona
    assert _plan_label(message) == ROOM_TYPE_LABEL
    assert _plan_in(message)["floor"]["tint"] == "#a88b6a"  # zamonaviy's laminate
    assert "rang" in SOFT_PLAN_RULE and "ustun" in SOFT_PLAN_RULE
    assert STARTING_PLAN_RULE not in message
    # the general guidance still holds, the accent wall line too
    for line in NO_STYLE_LINES:
        assert line in message


def test_a_room_type_s_plan_sends_no_wall_colours_when_the_request_has_its_own():
    message = _message("Iliq ranglar")  # zamonaviy: #d9d6d0 walls, a #8c8a86 accent
    assert "#d9d6d0" not in message and "#8c8a86" not in message
    start = _starting("Iliq ranglar", WALLS)
    assert "walls" not in start and {"floor", "lights", "trim"} <= set(start)


def test_a_room_type_s_plan_keeps_the_wall_colour_but_never_an_accent():
    start = _starting("Shinam mehmonxona", WALLS)
    assert start["walls"] == {"main": {"type": "paint", "color": "#d9d6d0"}}
    assert NO_STYLE_LINES[2] in _message("Shinam mehmonxona")


@pytest.mark.parametrize(("prompt", "colours"), [
    ("Iliq ranglar", True), ("yorqin xona", True), ("to'q devorlar", True), ("toʻq devorlar", True),
    ("och tuslar", True), ("quyuq ranglar", True), ("kulrang devor", True),
    ("Yashil va oq", True), ("oltin detallar", True), ("светлая", True),
    ("Shinam mehmonxona", False), ("sokin", False), ("ochiq oshxona", False), ("keng va qulay", False),
])
def test_colour_and_mood_words_take_the_wall_colours_out_of_the_room_type_s_plan(prompt, colours):
    assert ("walls" not in _starting(prompt, WALLS)) is colours


def test_a_study_without_a_style_starts_on_laminate_not_minimalist_tile():
    message = _message("sokin kabinet", {**ROOM, "room_type": "kabinet"})
    start = json.loads(message.split("Boshlang'ich reja", 1)[1].split("\n")[1])
    assert start["floor"] == {"type": "laminate", "pattern": None, "tint": None}
    # a shape the studio takes as it is
    p = ad.validate_plan({**GOOD, "floor": start["floor"]}, BY_LABEL, WALLS)
    assert p.floor == {"type": "laminate", "pattern": None, "tint": None}
    # a named minimalist study keeps the style's own tile
    named = _message("minimalist kabinet", {**ROOM, "room_type": "kabinet"})
    assert json.loads(named.split("Boshlang'ich reja", 1)[1].split("\n")[1])["floor"]["type"] == "tile"


def test_the_soft_rule_comes_before_the_room_type_s_plan():
    message = _message("Shinam mehmonxona")
    assert message.index(SOFT_PLAN_RULE) < message.index("Boshlang'ich reja")


def test_a_named_style_wins_over_the_room_type_s_own():
    message = _message("loft", {**ROOM, "room_type": "yotoqxona"})
    assert _plan_label(message) == "Loft"
    assert STARTING_PLAN_RULE in message and SOFT_PLAN_RULE not in message


@pytest.mark.parametrize(("room_type", "preset"), [
    ("mehmonxona", "zamonaviy"), ("oshxona", "zamonaviy"), ("yotoqxona", "skandinav"), ("bolalar", "skandinav"),
    ("balkon", "skandinav"), ("kabinet", "minimalist"), ("hammom", "minimalist"), (None, None),
])
def test_each_room_type_has_its_starting_style(room_type, preset):
    found = ad.starting_preset("iliq, sokin", room_type)
    assert (found["id"] if found else None) == preset
    assert ad.starting_preset("loft", room_type)["id"] == "loft"


def test_a_bathroom_without_a_style_starts_from_minimalist_on_tile():
    message = _message("sokin hammom", {**ROOM, "room_type": "hammom"})
    assert _plan_label(message) == ROOM_TYPE_LABEL
    start = _plan_in(message)
    assert start["trim"]["ceiling"] == "non_drop"  # minimalist's ceiling
    assert start["floor"] == {"type": "tile", "pattern": None, "tint": None}


def test_a_kitchen_without_a_style_starts_from_a_tile_floor():
    message = _message("iliq oshxona", {**ROOM, "room_type": "oshxona"})
    start = json.loads(message.split("Boshlang'ich reja", 1)[1].split("\n")[1])
    assert start["floor"] == {"type": "tile", "pattern": None, "tint": None}


def test_a_room_type_s_style_puts_its_furniture_first():
    items = [_styled("modern", ["zamonaviy"], "yotoqxona"), _styled("scandi", ["skandinav"], "yotoqxona")]
    _, by_label = ad.furniture_menu(items, "yotoqxona", "Shinam yotoqxona")
    assert by_label["F1"]["id"] == "scandi"
    # a style the request names still comes first
    _, by_label = ad.furniture_menu(items, "yotoqxona", "zamonaviy yotoqxona")
    assert by_label["F1"]["id"] == "modern"
    assert ad.furniture_styles_for_prompt("Shinam yotoqxona", None) == set()


async def test_design_room_hands_the_room_type_s_style_to_validation():
    reply = SimpleNamespace(content=[SimpleNamespace(type="text", text=json.dumps({**GOOD, "trim": {"ceiling": "flat"}}))])
    with patch("app.services.ai_designer.call_llm", new=AsyncMock(return_value=reply)):
        p = await ad.design_room("Iliq ranglar", ROOM, ITEMS, user_id="u")  # a mehmonxona: zamonaviy
    assert p.trim["ceiling"] == {"design": "flat", "settings": {"color": "#f2f1ee", "strip": True, "stripK": 3000}}


def test_gold_and_light_lines_hold_with_a_room_type_s_plan():
    message = _message("och ranglar, oltin detallar")
    assert GOLD_LINE in message and LIGHT_LINE in message


def test_gold_line_only_when_asked():
    assert GOLD_LINE not in _message("Neoklassik, och ranglar")
    assert GOLD_LINE in _message("Klassik, oltin detallar")
    assert "#C9A24B" not in ad._SYSTEM


def test_light_accent_line():
    assert LIGHT_LINE in _message("Neoklassik, och ranglar")
    assert LIGHT_LINE not in _message("qorong'i, iliq atmosfera")


def test_room_type_none_still_builds():
    message = _message("loft", {**ROOM, "room_type": None})
    assert "xona turi noma'lum" in message and "Boshlang'ich reja (Loft)" in message


def test_message_lists_trim_profiles():
    from app.services.design_presets import trim_profiles
    message = _message("iliq")
    profiles = trim_profiles()
    for kind in ("ceiling", "skirting", "cornice"):
        assert ", ".join(profiles[kind]) in message
    assert '"trim"' in ad._SYSTEM


def test_validate_plan_keeps_known_trim():
    p = plan(trim={"ceiling": "double_layer", "skirting": "b054", "cornice": "t140"})
    # the shape the studio applies for a ready-made style (frontend DesignTrim)
    assert p.trim == {"ceiling": {"design": "double_layer"}, "skirting": {"id": "b054"}, "cornice": {"id": "t140"}}
    assert p.warnings == []
    assert plan(trim={"ceiling": "flat", "skirting": "tekis", "cornice": None}).trim["cornice"] is None


def test_validate_plan_drops_unknown_trim_profile():
    p = plan(trim={"ceiling": "dome", "skirting": "b054", "cornice": "t999"})
    assert p.trim == {"skirting": {"id": "b054"}}  # unknown ones left out: the studio keeps what it has
    assert len(p.warnings) == 2
    assert plan(trim={"ceiling": "dome"}).trim is None
    assert plan().trim is None and plan(trim="flat").trim is None


def test_menu_bolalar_prefers_kids_items():
    items = [
        {"id": "sofa", "name_uz": "Divan", "category": "divan", "room_type": "mehmonxona", "placement": "pol"},
        {"id": "bed", "name_uz": "Karavot", "category": "karavot", "room_type": "yotoqxona", "placement": "pol"},
        {"id": "kids", "name_uz": "Bolalar karavoti", "category": "karavot", "room_type": "yotoqxona", "placement": "pol"},
    ]
    _, by_label = ad.furniture_menu(items, "bolalar")
    order = [v["id"] for v in by_label.values()]
    assert order[0] == "kids" and order.index("bed") < order.index("sofa")


def test_menu_kabinet_prefers_desk():
    items = [
        {"id": "bed", "name_uz": "Karavot", "category": "karavot", "room_type": "yotoqxona", "placement": "pol"},
        {"id": "sofa", "name_uz": "Divan", "category": "divan", "room_type": "mehmonxona", "placement": "pol"},
        {"id": "chair", "name_uz": "Ish stuli", "category": "stul", "room_type": "mehmonxona", "placement": "pol"},
        {"id": "desk", "name_uz": "Yozuv stoli", "category": "stol", "room_type": "mehmonxona", "placement": "pol"},
    ]
    _, by_label = ad.furniture_menu(items, "kabinet")
    order = [v["id"] for v in by_label.values()]
    assert set(order[:2]) == {"chair", "desk"} and order.index("sofa") < order.index("bed")


def _living(n):
    return [
        {"id": f"l{k}", "name_uz": f"Zal {k}", "category": "divan", "room_type": "mehmonxona", "placement": "pol"}
        for k in range(n)
    ]


def test_menu_kabinet_always_offers_a_desk_chair_and_shelf_from_other_rooms_first():
    study = [
        {"id": "desk", "name_uz": "Yozuv stoli", "category": "stol", "room_type": "yotoqxona", "placement": "pol"},
        {"id": "chair", "name_uz": "Ofis stuli", "category": "stul", "room_type": "yotoqxona", "placement": "pol"},
        {"id": "shelf", "name_uz": "Kitob javoni", "category": "javon", "room_type": "yotoqxona", "placement": "pol"},
    ]
    bed = {"id": "bed", "name_uz": "Karavot", "category": "karavot", "room_type": "yotoqxona", "placement": "pol"}
    items = _living(ad.MAX_CATALOG_IN_PROMPT + 10) + [bed] + study
    _, by_label = ad.furniture_menu(items, "kabinet")
    order = [v["id"] for v in by_label.values()]
    assert set(order[:3]) == {"desk", "chair", "shelf"}
    assert "bed" not in order and len(order) == ad.MAX_CATALOG_IN_PROMPT


def test_menu_mehmonxona_does_not_pull_in_other_rooms_desks():
    desk = {"id": "desk", "name_uz": "Yozuv stoli", "category": "stol", "room_type": "yotoqxona", "placement": "pol"}
    items = [desk] + _living(10)
    _, by_label = ad.furniture_menu(items, "mehmonxona")
    assert [v["id"] for v in by_label.values()] == [f"l{k}" for k in range(10)]


def test_menu_kabinet_without_a_desk_still_builds():
    _, by_label = ad.furniture_menu(_living(10), "kabinet")
    assert [v["id"] for v in by_label.values()] == [f"l{k}" for k in range(10)]


# --- fix round 1 -------------------------------------------------------------------------------

def _room_walls(ids):
    return {**ROOM, "walls": [{"id": w, "length": 3.0, "openings": []} for w in ids]}


def _starting(prompt, ids):
    message = _message(prompt, _room_walls(ids))
    line = message.split("Boshlang'ich reja", 1)[1].split("\n")[1]
    return json.loads(line)


def test_starting_plan_keeps_letters_in_an_a_to_d_room():
    start = _starting("zamonaviy", ["A", "B", "C", "D"])
    assert start["walls"]["accent"]["wall"] == "C"
    zones = [l["zone"] for l in start["lights"]]
    assert zones == ["center", "wall_A", "corner_C_D"]


def test_starting_plan_translates_walls_to_the_room_s_own_ids():
    start = _starting("zamonaviy", ["W1", "W2", "W3", "W4"])
    assert start["walls"]["accent"]["wall"] == "W3"
    assert [l["zone"] for l in start["lights"]] == ["center", "wall_W1", "corner_W3_W4"]
    neo = _starting("neoklassika", ["W1", "W2", "W3", "W4"])
    assert [l["zone"] for l in neo["lights"]] == ["center", "wall_W2", "wall_W4"]


def test_starting_plan_drops_what_a_smaller_room_lacks():
    start = _starting("zamonaviy", ["W1", "W2", "W3"])  # corner_CD needs a fourth wall
    assert [l["zone"] for l in start["lights"]] == ["center", "wall_W1"]
    assert start["walls"]["accent"]["wall"] == "W3"
    neo = _starting("neoklassika", ["W1", "W2", "W3"])
    assert [l["zone"] for l in neo["lights"]] == ["center", "wall_W2"]


def test_building_a_message_leaves_the_cached_presets_alone():
    import copy
    from app.services.design_presets import load_presets
    before = copy.deepcopy(load_presets())
    _message("zamonaviy", _room_walls(["W1", "W2", "W3"]))
    _message("neoklassika", _room_walls(["W1", "W2", "W3", "W4"]))
    assert load_presets() == before


def test_same_ceiling_as_the_starting_preset_keeps_its_settings():
    from app.services.design_presets import load_presets
    dark = load_presets()["dark"]
    p = ad.validate_plan({**GOOD, "trim": {"ceiling": "border"}}, BY_LABEL, WALLS, starting_preset=dark)
    assert p.trim["ceiling"] == {"design": "border", "settings": {"color": "#2f2f2f", "strip": True, "stripK": 2700}}
    p.trim["ceiling"]["settings"]["color"] = "#000000"
    assert dark["trim"]["ceiling"]["settings"]["color"] == "#2f2f2f"  # a copy, not the cached preset
    other = ad.validate_plan({**GOOD, "trim": {"ceiling": "flat"}}, BY_LABEL, WALLS, starting_preset=dark)
    assert other.trim["ceiling"] == {"design": "flat"}


async def test_design_room_hands_the_starting_preset_to_validation():
    reply = SimpleNamespace(content=[SimpleNamespace(type="text", text=json.dumps({**GOOD, "trim": {"ceiling": "non_drop"}}))])
    with patch("app.services.ai_designer.call_llm", new=AsyncMock(return_value=reply)):
        p = await ad.design_room("loft uslubida", ROOM, ITEMS, user_id="u")
    assert p.trim["ceiling"] == {"design": "non_drop", "settings": {"color": "#bdbab4"}}


@pytest.mark.parametrize(("prompt", "asked"), [
    ("pochta", False), ("ochiq oshxona", False), ("kam yorug'lik", False),
    ("och ranglar", True), ("yorug' ranglar", True), ("yorugʻ ranglar", True), ("светлая комната", True),
    ("yorug‘ ranglar", True), ("yorugʼroq", True), ("yorug`roq", True),
])
def test_light_line_only_for_light_colours(prompt, asked):
    assert (LIGHT_LINE in _message(prompt)) is asked


def test_a_plan_with_only_trim_is_not_empty():
    assert not ad.DesignPlan(trim={"cornice": None}).is_empty()


def test_first_style_tie_at_same_position_goes_by_furniture_styles_order(monkeypatch):
    import re as _re
    words = {"klassik": _re.compile("uslub"), "loft": _re.compile("uslub")}
    monkeypatch.setattr(ad, "_STYLE_WORDS", words)
    assert ad.first_style_in_prompt("uslub") == "klassik"
    monkeypatch.setattr(ad, "_STYLE_WORDS", dict(reversed(list(words.items()))))
    assert ad.first_style_in_prompt("uslub") == "loft"  # _STYLE_WORDS order is the tie-break


def test_first_style_by_position():
    assert ad.first_style_in_prompt("minimalist, keyin loft") == "minimalist"
    assert ad.first_style_in_prompt("loft va minimalist") == "loft"
    assert ad.first_style_in_prompt("iliq") is None


def test_no_gold_hex_in_the_system_prompt():
    assert "#B8860B" not in ad._SYSTEM and "#C9A24B" not in ad._SYSTEM


# --- final review ------------------------------------------------------------------------------

@pytest.mark.parametrize(("room_type", "prompt"), [("oshxona", "zamonaviy oshxona"), ("hammom", "milliy hammom")])
def test_styled_kitchen_and_bathroom_start_from_a_tile_floor(room_type, prompt):
    message = _message(prompt, {**ROOM, "room_type": room_type})
    start = json.loads(message.split("Boshlang'ich reja", 1)[1].split("\n")[1])
    assert start["floor"] == {"type": "tile", "pattern": None, "tint": None}
    assert "laminate" not in json.dumps(start) and "parquet" not in json.dumps(start)


def test_a_styled_living_room_keeps_the_preset_floor():
    start = _starting("zamonaviy", ["A", "B", "C", "D"])  # ROOM is a mehmonxona
    assert start["floor"]["type"] == "laminate"


def test_a_tile_floor_answer_is_kept_against_a_wooden_starting_preset():
    from app.services.design_presets import load_presets
    tile = {"type": "tile", "pattern": None, "tint": None}
    p = ad.validate_plan({**GOOD, "floor": tile}, BY_LABEL, WALLS, starting_preset=load_presets()["zamonaviy"])
    assert p.floor == tile


# --- moods that pick a ready-made style ----------------------------------------------------------

@pytest.mark.parametrize(("prompt", "preset"), [
    ("qorong'i, sokin mehmonxona", "dark"),
    ("qorongʻi xona", "dark"),
    ("dark mood", "dark"),
    ("тёмная гостиная", "dark"),
    ("to'q yashil devorlar", None),  # a dark colour is not the dark style
    ("qorong'i loft", "dark"),
    ("loft, qorong'i", "loft"),
    ("qorong'i mehmonxona", "dark"),
    ("dark room", "dark"),
    ("тёмная комната", "dark"),
    ("в тёмных тонах", "dark"),
    # A dark colour, or curtains that darken the room, are not the dark style.
    ("dark green walls", None),
    ("dark-blue accent wall", None),
    ("dark wood floor", None),
    ("тёмно-зелёные стены", None),
    ("затемняющие шторы", None),
    ("qorong'ilashtiruvchi parda", None),
    # Every apostrophe a phone keyboard types, and Uzbek in Cyrillic.
    ("qorong‘i", "dark"),
    ("qorongʼi", "dark"),
    ("qorong`i", "dark"),
    ("қоронғи хона", "dark"),
    ("қоронғилаштирувчи парда", None),
])
def test_the_dark_mood_starts_from_the_dark_preset_where_it_comes_first(prompt, preset):
    found = ad.starting_preset(prompt)
    assert (found["id"] if found else None) == preset


def test_a_dark_request_starts_from_the_dark_plan():
    start = _starting("qorong'i, sokin mehmonxona", ["A", "B", "C", "D"])
    assert start["walls"]["accent"] == {"wall": "C", "color": "#1a1a1a"}
    assert start["trim"]["ceiling"] == "border"
    assert "Boshlang'ich reja (Qorong'i)" in _message("qorong'i, sokin mehmonxona")


def test_a_dark_kitchen_still_starts_from_a_tile_floor():
    message = _message("qorong'i oshxona", {**ROOM, "room_type": "oshxona"})
    start = json.loads(message.split("Boshlang'ich reja", 1)[1].split("\n")[1])
    assert start["floor"] == {"type": "tile", "pattern": None, "tint": None}


def test_a_dark_request_puts_the_dark_style_s_furniture_first():
    items = [_styled("loft", ["loft"]), _styled("modern", ["zamonaviy"])]
    _, by_label = ad.furniture_menu(items, "mehmonxona", "qorong'i, sokin")
    assert by_label["F1"]["id"] == "modern"
    # a furniture style the request names is still the one that comes first
    _, by_label = ad.furniture_menu(items, "mehmonxona", "qorong'i loft")
    assert by_label["F1"]["id"] == "loft"


async def test_a_dark_answer_keeping_the_border_ceiling_keeps_its_settings():
    reply = SimpleNamespace(content=[SimpleNamespace(type="text", text=json.dumps({**GOOD, "trim": {"ceiling": "border"}}))])
    with patch("app.services.ai_designer.call_llm", new=AsyncMock(return_value=reply)):
        p = await ad.design_room("qorong'i, sokin mehmonxona", ROOM, ITEMS, user_id="u")
    assert p.trim["ceiling"] == {"design": "border", "settings": {"color": "#2f2f2f", "strip": True, "stripK": 2700}}


# --- small bedrooms ------------------------------------------------------------------------------

SMALL_ROOM_LINE = ad._SMALL_BEDROOM_LINE


def _sized(room_type, width, depth):
    return {**ROOM, "room_type": room_type, "width": width, "depth": depth, "area": width * depth}


@pytest.mark.parametrize(("room_type", "width", "depth", "small"), [
    ("yotoqxona", 3.0, 3.0, True),     # 9 m2
    ("bolalar", 3.2, 3.0, True),       # 9.6 m2
    ("yotoqxona", 4.2, 2.5, True),     # 10.5 m2, but too narrow for a double bed and a passage
    ("yotoqxona", 4.0, 4.0, False),    # 16 m2
    ("mehmonxona", 3.0, 3.0, False),   # not a bedroom
])
def test_a_small_bedroom_is_told_to_take_a_single_bed(room_type, width, depth, small):
    assert (SMALL_ROOM_LINE in _message("sokin xona", _sized(room_type, width, depth))) is small


def test_the_small_bedroom_line_asks_for_a_single_bed_and_a_narrow_wardrobe():
    assert "bir kishilik karavot" in SMALL_ROOM_LINE and "120 sm" in SMALL_ROOM_LINE
    assert "shkaf" in SMALL_ROOM_LINE


def test_the_message_shows_the_room_area():
    assert "xona 9.0 m2" in _message("sokin xona", _sized("yotoqxona", 3.0, 3.0))


def test_the_menu_shows_the_bed_s_size():
    lines, _ = ad.furniture_menu(ITEMS, "yotoqxona")
    assert any(line.startswith("F") and "Krovat (krovat, 2x1.6 m" in line for line in lines)
