"""An AI design's summary may say only what its plan holds."""
from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services import ai_design_text as txt
from app.services import ai_designer as ad

@pytest.fixture(autouse=True)
def _keep_catalog_order(monkeypatch):
    """The menu is shuffled in production; the tests refer to F1, F2... by position."""
    monkeypatch.setattr("app.services.ai_designer.random.shuffle", lambda items: None)


ITEMS = [
    {"id": "u-sofa", "name_uz": "Uch o'rinli divan", "category": "divan", "room_type": "mehmonxona", "placement": "pol", "footprint_w": 210, "footprint_d": 90},
    {"id": "u-bed", "name_uz": "Karavot", "category": "karavot", "room_type": "yotoqxona", "placement": "pol", "footprint_w": 200, "footprint_d": 160},
    {"id": "u-shelf", "name_uz": "Kitob shkafi", "category": "shkaf", "room_type": "mehmonxona", "placement": "pol", "footprint_w": 180, "footprint_d": 60},
    {"id": "u-tv", "name_uz": "TV tumba", "category": "tumba", "room_type": "mehmonxona", "placement": "pol", "footprint_w": 150, "footprint_d": 40},
]
with patch("app.services.ai_designer.random.shuffle", lambda items: None):
    _LINES, BY_LABEL = ad.furniture_menu(ITEMS, "mehmonxona")  # F1 divan, F2 shkaf, F3 tumba, F4 karavot
WALLS = ["A", "B", "C", "D"]


def make(summary="", **over):
    """A validated plan: warm paint, parquet, a chandelier, a sofa and a TV unit."""
    data = {
        "title": "T", "summary": summary,
        "walls": {"main": {"type": "paint", "color": "#e8dcc8"}},
        "floor": {"type": "parquet", "pattern": "chevron", "tint": None},
        "lights": [{"type": "chandelier", "zone": "center"}],
        "furniture": [{"id": "F1", "zone": "wall_C"}, {"id": "F3", "zone": "wall_B"}],
        **over,
    }
    return ad.validate_plan(data, BY_LABEL, WALLS)


class TestWhatWasWrongInTheRealCase:
    GOLD_CLAIM = "Oltin detallarga ega chiroq va mebellar urf-odatga do'stona, jozibali ko'rinish beradi."

    def test_gold_is_claimed_when_no_colour_of_the_plan_is_gold(self):
        problems = txt.summary_problems(self.GOLD_CLAIM, make())
        assert any("oltin" in p for p in problems)

    def test_the_summary_is_then_written_from_the_plan(self):
        plan = make(self.GOLD_CLAIM)
        assert txt.reconcile_summary(plan)
        assert "oltin" not in plan.summary.lower()
        assert "Qandil" in plan.summary or "qandil" in plan.summary
        assert "Uch o'rinli divan" in plan.summary and "TV tumba" in plan.summary

    def test_gold_is_fine_when_a_colour_of_the_plan_is_gold(self):
        gold = {"main": {"type": "paint", "color": "#e8dcc8"}, "accent": {"wall": "C", "color": "#c9a227"}}
        assert txt.summary_problems(self.GOLD_CLAIM, make(walls=gold)) == [
            p for p in txt.summary_problems(self.GOLD_CLAIM, make(walls=gold)) if "oltin" not in p
        ]


class TestColours:
    @pytest.mark.parametrize("word", ["ko'k", "ko‘k", "yashil", "qizil", "pushti", "binafsha", "qora"])
    def test_a_colour_nobody_chose_is_caught(self, word):
        assert txt.summary_problems(f"Xonada {word} ranglar ustun.", make())

    def test_a_chosen_colour_is_backed(self):
        blue = {"main": {"type": "paint", "color": "#3a5fcd"}}
        assert not txt.summary_problems("Devorlar ko'k rangda.", make(walls=blue))

    def test_neutral_words_are_left_alone(self):
        assert not txt.summary_problems("Och, iliq, bej va kulrang ranglar, sokin atmosfera.", make())

    def test_dark_atmosphere_is_not_mistaken_for_black(self):
        assert not txt.summary_problems("Qorong'i va sokin atmosfera.", make())

    def test_a_wooden_floor_backs_brown(self):
        assert not txt.summary_problems("Jigarrang yog'och pol iliqlik beradi.", make())

    def test_brown_without_a_wooden_floor_or_brown_colour_is_caught(self):
        tile = {"type": "tile", "pattern": None, "tint": None}
        assert txt.summary_problems("Jigarrang tonlar.", make(floor=tile))


class TestColoursOfThingsThatCannotBeColoured:
    @pytest.mark.parametrize("text", [
        "Mebel sifatida qora uch o'rinli divan tanlandi.", "Oltin chiroq va qora kreslo.", "Oq mebel xonani yorqin qiladi.",
        "Kulrang divan devor oldida turadi.", "Ko'k qandil markazda.",
    ])
    def test_a_colour_given_to_furniture_or_a_light_is_caught(self, text):
        assert any("rangini tanlab bo'lmaydi" in p for p in txt.summary_problems(text, make()))

    @pytest.mark.parametrize("text", [
        "Devorlar oq rangda bo'yaldi, divan esa devor oldida turadi.",
        "Iliq bej devor oldida divan turadi.",
        "Qora bo'yoq bilan qoplangan devorlar, markazda qandil.",
        "Parket pol, divan va tumba.",
    ])
    def test_a_colour_that_belongs_to_the_walls_is_not(self, text):
        assert not any("rangini tanlab bo'lmaydi" in p for p in txt.summary_problems(text, make()))


class TestLanguage:
    def test_a_reply_that_turns_english_is_replaced(self):
        mixed = "Devorlar bo'yaldi. The walls are painted with a dark tint. The floor includes parquet and lighting."
        assert any("o'zbekcha emas" in p for p in txt.summary_problems(mixed, make()))

    def test_one_stray_english_word_is_not_enough(self):
        assert not any("o'zbekcha emas" in p for p in txt.summary_problems("Devorlar iliq, floor emas, pol parket.", make()))


class TestFurnitureAndLights:
    def test_a_piece_not_in_the_plan_is_caught(self):
        assert any("shkaf" in p for p in txt.summary_problems("Kitob shkafi devor oldida turadi.", make()))

    def test_chosen_pieces_may_be_named_with_endings_and_synonyms(self):
        assert not txt.summary_problems("Divanni devor oldiga, tumbani esa qarshisiga qo'ydik.", make())
        bed = make(furniture=[{"id": "F4", "zone": "wall_A"}])
        assert not txt.summary_problems("Krovat markazda turadi.", bed)  # krovat = karavot

    def test_a_bedroom_word_is_not_a_bed(self):
        assert not txt.summary_problems("Yotoqxona sokin bo'ladi.", make())

    def test_a_light_not_in_the_plan_is_caught(self):
        assert any("bra" in p for p in txt.summary_problems("Bra devor chiroqlari yumshoq nur beradi.", make()))
        assert any("LED" in p for p in txt.summary_problems("LED panellar yoritadi.", make()))

    def test_a_chosen_light_is_backed(self):
        assert not txt.summary_problems("Qandil xonaning markazida osilib turadi.", make())
        leds = make(lights=[{"type": "led_panel", "zone": "center"}])
        assert not txt.summary_problems("LED panel bilan yoritiladi.", leds)


class TestFloorAndWalls:
    def test_another_floor_is_caught(self):
        assert any("tile" in p for p in txt.summary_problems("Plitka pol salqin.", make()))

    def test_the_chosen_floor_is_backed(self):
        assert not txt.summary_problems("Chevron naqshli parket pol.", make())

    def test_wallpaper_claimed_for_painted_walls_is_caught(self):
        assert txt.summary_problems("Oboy devorlarga o'ziga xoslik beradi.", make())

    def test_paint_claimed_for_wallpapered_walls_is_caught_unless_an_accent_wall_is_painted(self):
        oboy = {"main": {"type": "oboy", "pattern": "geometrik", "base_color": "#f4efea", "accent_color": "#a67b5b"}}
        assert txt.summary_problems("Devorlar bo'yoq bilan qoplanadi.", make(walls=oboy))
        with_accent = {**oboy, "accent": {"wall": "C", "color": "#a67b5b"}}
        assert not txt.summary_problems("C devor bo'yoq bilan ajratildi.", make(walls=with_accent))


class TestReconcile:
    def test_a_truthful_summary_is_kept_word_for_word(self):
        plan = make("Iliq bej devorlar va parket pol, markazda qandil, divan va tumba.")
        before = plan.summary
        assert txt.reconcile_summary(plan) == []
        assert plan.summary == before

    def test_an_empty_summary_is_written_from_the_plan(self):
        plan = make("")
        assert txt.reconcile_summary(plan)
        assert "Mebel:" in plan.summary

    def test_the_written_summary_never_trips_its_own_check(self):
        plan = make("Oltin qizil ko'k binafsha plitka oboy bra LED torsher kreslo.")
        txt.reconcile_summary(plan)
        assert txt.summary_problems(plan.summary, plan) == []


class TestDescribePlan:
    def test_says_what_the_plan_does(self):
        plan = make(
            walls={"main": {"type": "oboy", "pattern": "geometrik", "base_color": "#f4efea", "accent_color": "#a67b5b"}, "accent": {"wall": "C", "color": "#2f2b28"}},
            lights=[{"type": "led_panel", "zone": "center"}, {"type": "led_panel", "zone": "wall_A"}, {"type": "bra", "zone": "wall_A"}],
        )
        text = txt.describe_plan(plan)
        assert "geometrik oboy" in text and "C devor" in text and "qora" in text
        assert "parket" in text and "shevron" in text
        assert "2 ta led panel" in text and "bra" in text
        assert "Uch o'rinli divan" in text

    def test_a_plan_with_nothing_describes_nothing(self):
        assert txt.describe_plan(SimpleNamespace(walls={}, floor=None, lights=[], furniture=[])) == ""

    def test_an_accent_without_a_main_finish_is_still_a_sentence(self):
        plan = SimpleNamespace(walls={"accent": {"wall": "B", "color": "#2f2b28"}}, floor=None, lights=[], furniture=[])
        assert txt.describe_plan(plan).startswith("B devor")

    @pytest.mark.parametrize("hex_color,name", [
        ("#000000", "qora"), ("#ffffff", "oq"), ("#808080", "kulrang"), ("#e8dcc8", "bej"),
        ("#5b3a29", "jigarrang"), ("#d32f2f", "qizil"), ("#2e7d32", "yashil"), ("#14285a", "to'q ko'k"), ("#3a5fcd", "ko'k"),
    ])
    def test_colour_names(self, hex_color, name):
        assert txt.colour_name(hex_color) == name


class TestDesignRoomEndToEnd:
    ROOM = {"name": "Mehmonxona", "room_type": "mehmonxona", "width": 5, "depth": 4, "ceiling_h": 2.7,
            "walls": [{"id": w, "length": 4, "openings": []} for w in WALLS]}

    def _reply(self, summary):
        data = {
            "title": "Iliq", "walls": {"main": {"type": "paint", "color": "#e8dcc8"}},
            "floor": {"type": "parquet", "pattern": "chevron", "tint": None},
            "lights": [{"type": "chandelier", "zone": "center"}],
            "furniture": [{"id": "F1", "zone": "wall_C"}],
            "summary": summary,
        }
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=json.dumps(data))])

    async def test_a_boastful_summary_is_replaced_before_it_reaches_the_user(self):
        reply = self._reply("Oltin chiroq va qora kreslo xonaga hashamat beradi.")
        with patch("app.services.ai_designer.call_llm", new=AsyncMock(return_value=reply)):
            plan = await ad.design_room("oltin detallar", self.ROOM, ITEMS, user_id="u")
        assert "oltin" not in plan.summary.lower() and "kreslo" not in plan.summary.lower()
        assert "Uch o'rinli divan" in plan.summary

    async def test_an_honest_summary_reaches_the_user_untouched(self):
        honest = "Iliq bej devorlar, parket pol va qandil, divan bilan."
        with patch("app.services.ai_designer.call_llm", new=AsyncMock(return_value=self._reply(honest))):
            plan = await ad.design_room("iliq", self.ROOM, ITEMS, user_id="u")
        assert plan.summary == honest

    async def test_the_prompt_tells_the_model_what_the_summary_may_say(self):
        call = AsyncMock(return_value=self._reply("Iliq."))
        with patch("app.services.ai_designer.call_llm", new=call):
            await ad.design_room("x", self.ROOM, ITEMS, user_id="u")
        system = call.await_args.kwargs["system"]
        assert "FAQAT siz yuqorida tanlagan narsalarni" in system
        assert "RANGINI tanlab bo'lmaydi" in system
        assert system.index('"furniture"') < system.index('"summary": "..."')  # summary is written last


class TestClipSummary:
    def test_a_short_summary_is_untouched(self):
        assert ad._clip_summary("  Qisqa matn.  ") == "Qisqa matn."

    def test_a_long_one_is_cut_at_a_full_sentence(self):
        long = ("Bu jumla yetarlicha uzun va ma'noli. " * 30).strip()
        out = ad._clip_summary(long)
        assert len(out) <= ad.SUMMARY_MAX and out.endswith(".") and not out.endswith("..")

    def test_a_long_run_with_no_sentence_end_is_dropped_not_cut_mid_word(self):
        assert ad._clip_summary("so'z " * 300) == ""

    def test_a_dropped_summary_is_written_from_the_plan(self):
        plan = make("so'z " * 300)
        assert plan.summary == ""
        assert txt.reconcile_summary(plan)
        assert "Mebel:" in plan.summary


class TestTheShopsOwnNames:
    NAMES = ["Uch o'rinli divan", "TV tumba", "Pufik", "Yozuv stoli", "Devor javoni", "Katta gilam"]

    def test_a_piece_of_the_catalog_that_was_not_chosen_is_caught_by_its_own_name(self):
        problems = txt.summary_problems("Burchakda yumshoq pufik turadi.", make(), self.NAMES)
        assert any("pufik" in p for p in problems)

    def test_the_fixed_list_alone_would_have_missed_it(self):
        assert not txt.summary_problems("Burchakda yumshoq pufik turadi.", make())

    def test_a_chosen_piece_may_be_named_as_its_catalog_name_says(self):
        assert not txt.summary_problems("Uch o'rinli divan va TV tumba tanlandi.", make(), self.NAMES)

    def test_words_every_room_description_uses_are_not_taken_for_a_piece(self):
        # "Devor javoni" is in the catalog, and "devor" is in every summary
        assert not txt.summary_problems("Devorlar iliq rangda, xona yorug'.", make(), self.NAMES)

    def test_the_word_of_a_chosen_piece_covers_a_similar_unchosen_one(self):
        # "stoli" belongs to the unchosen "Yozuv stoli" but the plan has no table-like name: it is caught...
        assert txt.summary_problems("Yozuv stoli oynaga qaraydi.", make(), self.NAMES)
        # ...and a plan that does hold "Jurnal stoli" makes the word fair to use
        plan = make(furniture=[{"id": "F1", "zone": "wall_C"}, {"id": "F3", "zone": "wall_B"}])
        plan.furniture.append({"id": "x", "name": "Jurnal stoli", "zone": "center"})
        assert not txt.summary_problems("Jurnal stoli markazda.", plan, self.NAMES)

    def test_reconcile_uses_the_names_when_given(self):
        plan = make("Burchakda yumshoq pufik turadi.")
        assert txt.reconcile_summary(plan, self.NAMES)
        assert "pufik" not in plan.summary.lower()


def test_describe_plan_names_the_laying_in_uzbek():
    from types import SimpleNamespace
    from app.services.ai_design_text import describe_plan

    plan = SimpleNamespace(
        walls={}, floor={"type": "parquet", "pattern": "herringbone"}, lights=[], furniture=[],
    )
    text = describe_plan(plan)
    assert "herringbone" not in text and "yelkan" in text


def test_a_raw_pattern_id_in_the_text_is_caught_and_number_words_are_not_piece_names():
    plan = make()
    assert txt.summary_problems("Polda herringbone naqshli parket.", plan)
    names = ["Ikki kishilik karavot"]
    assert not txt.summary_problems("Ikki devor bej rangda.", plan, names)


def test_a_pattern_id_in_the_prose_is_said_in_uzbek_and_the_summary_kept():
    plan = make("Polda herringbone naqshli parquet yotadi.")
    assert txt.reconcile_summary(plan) == []
    assert plan.summary == "Polda yelkan naqshli parket yotadi."
