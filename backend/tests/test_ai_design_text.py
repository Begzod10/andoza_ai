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
        "furniture": [{"id": "F1", "role": "sofa"}, {"id": "F3", "role": "bed"}],
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


class TestAColourThatIsPartOfAChosenPiecesName:
    """'kulrang gilam' for the chosen 'ZZ Gilam kulrang' names that piece: it claims no colour."""

    # The qorong'i eval run (2026-10-26): kept but for this one rule.
    QORONGI_SUMMARY = (
        "Mehmonxona devorlari qorong'i kulrang va qora ranglarda bo'yoq bilan qoplangan, bu xona uchun dramatik va "
        "jiddiy atmosfera yaratadi. Pol uchun herringbone naqshli yog'och parket tanlandi, u issiq va tabiiy tus beradi. "
        "Markazda qandil, burchakda torsher va devorda LED chiziqli yoritgichlar yordamida xira va iliq yoritish "
        "ta'minlandi. Zamonaviy uslubdagi Nova divan, Soft kreslo, shisha-metall jurnal stoli, Grafit TV tumba va "
        "kulrang gilam xona dizaynini mukammal to'ldiradi."
    )
    QORONGI_NAMES = ["ZZ Divan Nova", "ZZ Kreslo Soft", "ZZ Jurnal stoli shisha-metall", "ZZ TV tumba Grafit", "ZZ Gilam kulrang"]
    QORONGI_ROLES = ["sofa", "armchair", "coffee_table", "tv_unit", "rug"]

    def qorongi(self, summary=QORONGI_SUMMARY):
        return ad.DesignPlan(
            title="Qorong'i Zamonaviy Mehmonxona", summary=summary,
            walls={"main": {"type": "paint", "color": "#2c2c2c"}, "accent": {"wall": "C", "color": "#1a1a1a"}},
            floor={"type": "parquet", "pattern": "herringbone", "tint": "#3d2b1f"},
            lights=[{"type": "chandelier", "zone": "center"}, {"type": "floor_lamp", "zone": "corner_B_C"}, {"type": "led_linear", "zone": "wall_C"}],
            furniture=[{"id": f"f{i}", "name": n, "role": r} for i, (n, r) in enumerate(zip(self.QORONGI_NAMES, self.QORONGI_ROLES))],
        )

    def test_the_real_qorongi_summary_is_kept(self):
        plan = self.qorongi()
        assert txt.reconcile_summary(plan, self.QORONGI_NAMES) == []
        assert "kulrang gilam" in plan.summary

    def test_a_colour_no_chosen_name_holds_is_still_caught(self):
        for plan in (make(), self.qorongi()):
            assert any("'qizil gilam'" in p for p in txt.summary_problems("Markazda qizil gilam.", plan))

    @pytest.mark.parametrize("summary, name", [
        ("Markazda oq gilam.", "Gilam oqshom"),  # "oq" is not the start of another word
        ("Burchakda qizil lampa.", "Divan L qizil"),  # "lampa" is not the "L" of a model
        ("Markazda kulrang gilam.", "Gilamcha kulrang"),  # the summary may add an ending to the name's word, not drop one
    ])
    def test_only_the_name_s_own_words_excuse_a_colour(self, summary, name):
        plan = ad.DesignPlan(
            walls={"main": {"type": "paint", "color": "#e8dcc8"}},
            furniture=[{"id": "f0", "name": name, "role": "rug"}],
        )
        assert any("rangini tanlab bo'lmaydi" in p for p in txt.summary_problems(summary, plan))

    def test_a_noun_with_an_ending_still_names_the_piece(self):
        plan = self.qorongi("Xonada kulrang gilamcha va divan bor.")
        assert not any("rangini tanlab bo'lmaydi" in p for p in txt.summary_problems(plan.summary, plan))

    def test_the_name_in_its_own_order_still_passes(self):
        assert not any("rangini tanlab bo'lmaydi" in p for p in txt.summary_problems("Polda Gilam kulrang.", self.qorongi()))


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
        bed = make(furniture=[{"id": "F4", "role": "bed"}])
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
            "furniture": [{"id": "F1", "role": "sofa"}],
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
        plan = make(furniture=[{"id": "F1", "role": "sofa"}, {"id": "F3", "role": "bed"}])
        plan.furniture.append({"id": "x", "name": "Jurnal stoli", "role": "coffee_table"})
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


class TestHonestSummariesSurvive:
    """The failures of the real answers (eval report, 2026-10-26): honest summaries were thrown away."""
    CATALOG = ["Karavoti Stul Yog'och naqshli", "Kulrang divan Verona", "Vitrina Neo", "Uch o'rinli divan", "TV tumba"]

    def test_common_words_not_flagged(self):
        text = "Yog'och karavoti, stul, naqshli gilam va kulrang yostiqlar iliq muhit beradi."
        assert not txt._catalog_problems(txt._norm(text), make(), self.CATALOG)

    def test_distinctive_unchosen_name_flagged(self):
        problems = txt._catalog_problems("milliy ruhda vitrina neo turadi.", make(), self.CATALOG)
        assert any("vitrina" in p for p in problems)

    def test_shinam_is_not_track_light(self):
        plan = make("Shinam va yorug' xona.")
        assert not txt.summary_problems(plan.summary, plan)
        assert txt.summary_problems("Trek chiroqlar o'rnatiladi.", make())
        assert txt.summary_problems("Shina chiroq bor.", make())

    def test_gold_named_oltin(self):
        assert txt.colour_name("#C9A24B") == "oltin"
        assert txt.colour_name("#B8860B") == "oltin"

    def test_gold_accent_is_described_as_gold(self):
        plan = make(walls={"main": {"type": "paint", "color": "#e8dcc8"}, "accent": {"wall": "B", "color": "#B8860B"}})
        assert "oltin" in txt.describe_plan(plan)

    def test_same_colour_accent_not_described_as_distinct(self):
        plan = make(walls={"main": {"type": "paint", "color": "#e8dcc8"}, "accent": {"wall": "C", "color": "#E8DCC8"}})
        assert "ajratiladi" not in txt.describe_plan(plan)
        plan = make(walls={"main": {"type": "paint", "color": "#e8dcc8"}, "accent": {"wall": "C", "color": "#e9dcc9"}})
        assert "ajratiladi" not in txt.describe_plan(plan)

    def test_a_clearly_different_accent_is_still_described(self):
        plan = make(walls={"main": {"type": "paint", "color": "#e8dcc8"}, "accent": {"wall": "C", "color": "#2f2b28"}})
        assert "C devor" in txt.describe_plan(plan)

    @pytest.mark.parametrize("text", ["Trekli chiroq o'rnatiladi.", "Shinasi bor.", "Treklar yoritadi.", "Shina chiroq."])
    def test_suffixed_track_words_flagged(self, text):
        assert txt.summary_problems(text, make())

    @pytest.mark.parametrize("text", ["Brasi devorda.", "Bralar yoritadi.", "Brada yorug'lik."])
    def test_suffixed_bra_flagged(self, text):
        assert txt.summary_problems(text, make())


class TestOwnColourNamesPassTheCheck:
    """A summary written from the plan must not be rejected for the colour names it uses itself."""

    @staticmethod
    def _flags(hex_color):
        plan = SimpleNamespace(walls={"main": {"type": "paint", "color": hex_color}}, floor=None)
        return txt._colour_problems(txt._norm(txt.colour_name(hex_color)), plan)

    @staticmethod
    def _grid():
        import colorsys
        out = []
        for hue in range(0, 360, 5):
            for s in (0.05, 0.1, 0.12, 0.15, 0.25, 0.4, 0.47, 0.6, 0.9):
                for l in (0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.72, 0.85, 0.92):
                    r, g, b = colorsys.hls_to_rgb(hue / 360, l, s)
                    out.append("#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255)))
        out += ["#%02x%02x%02x" % (v, v, v) for v in range(0, 256, 15)]
        return out

    def test_every_name_on_a_grid_of_colours_passes(self):
        bad = {h: (txt.colour_name(h), p) for h in self._grid() if (p := self._flags(h))}
        assert not bad, f"{len(bad)} colours flagged, e.g. {list(bad.items())[:5]}"

    @pytest.mark.parametrize("hex_color", ["#a8dadc", "#5fb3b3", "#e07b39", "#b49090"])
    def test_reported_cases(self, hex_color):
        assert self._flags(hex_color) == []

    def test_a_clearly_wrong_word_is_still_flagged(self):
        plan = SimpleNamespace(walls={"main": {"type": "paint", "color": "#3a5fcd"}}, floor=None)
        assert txt._colour_problems("qizil devor", plan)
        assert txt._colour_problems("sariq devor", plan)
        orange = SimpleNamespace(walls={"main": {"type": "paint", "color": "#e07b39"}}, floor=None)
        assert txt._colour_problems("ko'k devor", orange)
        assert txt._colour_problems("oltin detallar", orange)


class TestEnglishAndIdsLeakingThrough:
    """Kept summaries of the eval (2026-10-26) that still read the studio's ids or English."""
    TRIM = {"ceiling": "border", "skirting": "b054", "cornice": "t160"}

    def test_the_trim_ids_in_the_text_fall_back_to_the_plain_summary(self):
        plan = make("Ceiling trim border, skirting b054 va galtel t160 xonaga nafis ko'rinish beradi.", trim=self.TRIM)
        assert txt.reconcile_summary(plan)
        assert plan.summary == txt.describe_plan(plan)

    @pytest.mark.parametrize("text", ["Plintus b054 devorni tugatadi.", "Galtel T160 shiftni bezaydi.", "Shift border uslubida."])
    def test_each_plan_trim_id_is_a_leak(self, text):
        assert txt.summary_problems(text, make(trim=self.TRIM))

    def test_light_ids_are_said_in_uzbek_and_the_summary_kept(self):
        lights = [{"type": "chandelier", "zone": "center"}, {"type": "floor_lamp", "zone": "corner"},
                  {"type": "led_linear", "zone": "center"}]
        plan = make("Markazda chandelier, burchakda floor lamp va shiftda led linear yorug'lik beradi.", lights=lights)
        assert txt.reconcile_summary(plan) == []
        assert plan.summary == "Markazda qandil, burchakda torsher va shiftda LED chiziqli yorug'lik beradi."

    @pytest.mark.parametrize("raw", ["floor_lamp", "Floor-Lamp", "FLOOR LAMP"])
    def test_light_id_variants(self, raw):
        assert txt._localise(f"Burchakda {raw} turadi.") == "Burchakda torsher turadi."

    def test_a_light_name_starting_a_sentence_keeps_its_capital(self):
        assert txt._localise("Chandelier markazda. Floor lamp burchakda.") == "Qandil markazda. Torsher burchakda."

    # The prompt gives the model our own names ("ies (IES spot)", "pendant (Osma chiroq)"), so it writes
    # them, an id and all: each comes out as clean Uzbek, no word said twice.
    @pytest.mark.parametrize(("text", "said"), [
        ("Shiftda IES spot chiroqlar bor.", "Shiftda IES spot chiroqlar bor."),
        ("Stol ustida Pendant chiroq osilgan.", "Stol ustida osma chiroq osilgan."),
        ("Hammomda bath chirog'i yonadi.", "Hammomda vanna chirog'i yonadi."),
        ("Hammomda bath chirogʻi yonadi.", "Hammomda vanna chirogʻi yonadi."),
        ("Shiftda Spotlight chiroqlar bor.", "Shiftda spot chiroqlar bor."),
        ("Shiftda track tizimi bor.", "Shiftda trek tizimi bor."),
        ("Shiftda track bor.", "Shiftda trek chirog'i bor."),
    ])
    def test_our_own_names_are_not_doubled(self, text, said):
        assert txt._localise(text) == said

    @pytest.mark.parametrize("text", ["Shiftda spot chiroq chiroqlar bor.", "IES spot spot chiroqlar yonadi."])
    def test_a_word_said_twice_is_a_problem(self, text):
        assert any("takror" in p for p in txt.summary_problems(text, make()))

    def test_a_word_said_once_is_not(self):
        assert not any("takror" in p for p in txt.summary_problems("Spot chiroqlar va osma chiroq yonadi.", make()))

    def test_a_clean_uzbek_summary_is_unchanged(self):
        text = "Iliq bej devorlar, parket pol va markazdagi qandil sokin muhit beradi."
        plan = make(text, trim=self.TRIM)
        assert txt.reconcile_summary(plan) == []
        assert plan.summary == text

    def test_a_shop_code_that_is_not_the_plan_trim_id_is_left_alone(self):
        plan = make(trim={"ceiling": "flat", "skirting": "b052", "cornice": "t56"})
        assert not txt.summary_problems("Qandil KG1126P-18 va B054 divan xonani bezaydi.", plan)

    def test_a_light_named_as_its_id_keeps_the_prose_spelling(self):
        assert txt._localise("Devorda bra va led_track bor.") == "Devorda bra va LED trek chirog'i bor."


def _eval_plan(summary, walls, floor, lights, furniture, trim=None):
    """A validated plan as the eval of 2026-10-26 recorded it: the pieces by their shop names."""
    return SimpleNamespace(
        summary=summary, walls=walls, floor=floor, lights=[{"type": t, "zone": "center"} for t in lights],
        furniture=[{"name": n} for n in furniture], trim=trim,
    )


class TestAnEnglishTailDoesNotCostTheSummary:
    """Six of the thirteen eval summaries (2026-10-26) were thrown away for one English sentence at
    the end: the Uzbek before it was honest, so it is kept and only the English goes."""

    HITECH = _eval_plan(
        "Xonada qoraytirilgan devor C devorining aksenti sifatida ajratilgan, asosiy devorlar och kulrang bo'yoq "
        "bilan qoplangan. Pol uchun toza va sovuq effekt beruvchi kafel tanlandi. Asosiy yoritish sifatida LED panel "
        "va yordamchi chiroqlar sifatida LED trek va spot chiroqlar ishlatilgan. Mevcut hi-tech uslubga mos keladigan "
        "F1 divan, F2 TV tumba, F3 shisha-metall jurnal stoli, F4 indastrial kreslo va F9 javon tanlandi, shuningdek, "
        "F12 pufik dekor sifatida joylashtirildi. The room features a dark accent wall on wall C with light gray main walls.",
        {"main": {"type": "paint", "color": "#f4f5f6"}, "accent": {"wall": "C", "color": "#2b2f33"}},
        {"type": "tile", "pattern": None, "tint": None},
        ["led_panel", "led_track", "spotlight"],
        ["ZZ Divan Vektor", "ZZ TV tumba Glyanets", "ZZ Jurnal stoli shisha-metall", "ZZ Kreslo Indastrial",
         "ZZ Pufik", "ZZ Javon Nord"],
        {"ceiling": {"design": "floating"}, "skirting": {"id": "tekis"}, "cornice": None},
    )
    MILLIY = _eval_plan(
        "Xonada milliy uslubga mos ravishda gul naqshli oboy va iliq rangli herringbone parquet pol tanlandi. "
        "Asosiy yoritish uchun qandil va devor bra chiroqlari ishlatildi. Mebel sifatida milliy uslubdagi Samarqand "
        "divan, Buxoro kreslosi, o'ymakor jurnal stoli, Buxoro naqshli gilam va bezak uchun pufik tanlandi. This design "
        "reflects a traditional Uzbek style with warm tones and complementary furniture to create a cohesive and "
        "inviting living room.",
        {"main": {"type": "oboy", "pattern": "gul", "base_color": "#f3e6cf", "accent_color": "#9e2b25"}},
        {"type": "parquet", "pattern": "herringbone", "tint": "#6b3f22"},
        ["chandelier", "bra", "bra"],
        ["ZZ Divan Samarqand", "ZZ Kreslo Buxoro", "ZZ Jurnal stoli o'ymakor", "ZZ Gilam Buxoro naqshli", "ZZ Pufik"],
        {"ceiling": {"design": "recessed"}, "skirting": {"id": "b055"}, "cornice": {"id": "t56"}},
    )
    KLASSIK = _eval_plan(
        "Bu klassik dizayn uchun damask naqshli oboy va oltin rangdagi aksent rang tanlandi. Pol uchun herringbone "
        "naqshli parquet yog'ochi va iliq jigarrang tus tanlandi. Asosiy yoritish uchun qandil, devor uchun bra va "
        "burchak uchun torsher chiroqlari tanlandi. Mebellar orasida klassik uslubdagi Chester divan, Barokko kreslo, "
        "zarhal jurnal stoli, Oxford kitob shkafi va Fors gilami mavjud. This design combines damask wallpaper with "
        "golden accents and herringbone parquet flooring to create a warm classical atmosphere, complemented by a "
        "chandelier, bra, and floor lamp.",
        {"main": {"type": "oboy", "pattern": "damask", "base_color": "#f5f1e6", "accent_color": "#c9a24b"}},
        {"type": "parquet", "pattern": "herringbone", "tint": "#8a5a33"},
        ["chandelier", "bra", "floor_lamp"],
        ["ZZ Divan Chester", "ZZ Kreslo Barokko", "ZZ Jurnal stoli zarhal", "ZZ Kitob shkafi Oxford", "ZZ Gilam Fors"],
        {"ceiling": {"design": "double_layer"}, "skirting": {"id": "b053"}, "cornice": {"id": "t339"}},
    )
    ZAMONAVIY = _eval_plan(
        "Xonada iliq zamonaviy muhit yaratish uchun devorlar och rangli bo'yoq bilan qoplandi, asosiy devorda biroz "
        "qorong'i aksent berildi. Pol uchun iliq rangdagi yog'och naqshli laminat tanlandi. Yorug'lik uchun LED "
        "chiziqli asosiy chiroq, devor bo'ylab downlightlar va burchakda iliq ta'sir beruvchi torsher qo'shildi. Mebel "
        "sifatida zamonaviy uslubdagi divan, ikki xil kreslo, zamonaviy TV tumba va minimalist jurnal stoli tanlandi. "
        "This selection balances warm tones and modern style with functional and cozy furniture pieces.",
        {"main": {"type": "paint", "color": "#d9d6d0"}, "accent": {"wall": "C", "color": "#8c8a86"}},
        {"type": "laminate", "pattern": "wood_strip", "tint": "#a88b6a"},
        ["led_linear", "downlight", "floor_lamp"],
        ["ZZ Divan Nova", "ZZ Kreslo Soft", "ZZ TV tumba Grafit", "ZZ Jurnal stoli Mono", "ZZ Kreslo Bergen"],
        {"ceiling": {"design": "flat"}, "skirting": {"id": "tekis"}, "cornice": None},
    )
    YOTOQ_2 = _eval_plan(
        "Yotoqxona uchun iliq va tinchlantiruvchi atmosfera yaratish maqsadida devorlar uchun ochiq pastel bej rangli "
        "bo'yoq tanlandi va pol uchun to'q jigarrang herringbone naqshli parket tanlandi. Markaziy qandil va eshik "
        "devorida joylashgan bra yordamchi yoritgich sifatida tanlandi, bu esa xonaga iliq va qulay yorug'lik beradi. "
        "Mebel sifatida neoklassik uslubdagi Verona karavoti, tumbochka, kiyim shkafi, yozuv stoli va oddiy stul "
        "tanlandi. This design creates a cozy neoclassical bedroom with warm tones and harmonious lighting.",
        {"main": {"type": "paint", "color": "#d9cfc6"}},
        {"type": "parquet", "pattern": "herringbone", "tint": "#8b6d5c"},
        ["chandelier", "bra"],
        ["ZZ Karavot Verona 160", "ZZ Tumbochka Verona", "ZZ Kiyim shkafi Verona", "ZZ Tuvalet stoli Verona", "ZZ Stul"],
        {"ceiling": {"design": "border"}, "skirting": {"id": "b054"}, "cornice": {"id": "t140"}},
    )
    BOLALAR = _eval_plan(
        "Xonada iliq va yorqin atmosfera yaratish uchun och ko'k rangda devor bo'yoq ishlatildi. Yog'och polga "
        "o'xshash, light blue rangga yaqin laminate wood_strip naqshida tanlandi. Asosiy yoritish uchun shift chirog'i, "
        "yordamchi sifatida devorga o'rnatilgan bra chiroqlari tanlandi. Mebellar orasida bolalar karavoti, kitob "
        "javoni, o'yin stoli va stul hamda bezak sifatida pufik joylandi. This design creates a bright and warm "
        "atmosphere suitable for a children's room with harmonious colors and functional furniture.",
        {"main": {"type": "paint", "color": "#a7d3f4"}},
        {"type": "laminate", "pattern": "wood_strip", "tint": "#e6f1ff"},
        ["ceiling", "bra", "bra"],
        ["ZZ Bolalar karavoti", "ZZ Bolalar kitob javoni", "ZZ O'yin stoli", "ZZ Stul", "ZZ Pufik"],
        {"ceiling": {"design": "flat"}, "skirting": {"id": "b053"}, "cornice": {"id": "t140"}},
    )

    @staticmethod
    def _reconciled(plan):
        plan = SimpleNamespace(**vars(plan))  # each test gets its own copy of the shared plan
        return txt.reconcile_summary(plan), plan.summary

    def test_hitech_keeps_its_uzbek_and_loses_the_english_and_the_piece_ids(self):
        problems, summary = self._reconciled(self.HITECH)
        assert problems == []
        assert summary == (
            "Xonada qoraytirilgan devor C devorining aksenti sifatida ajratilgan, asosiy devorlar och kulrang bo'yoq "
            "bilan qoplangan. Pol uchun toza va sovuq effekt beruvchi kafel tanlandi. Asosiy yoritish sifatida LED "
            "panel va yordamchi chiroqlar sifatida LED trek va spot chiroqlar ishlatilgan."
        )

    def test_milliy_keeps_its_uzbek(self):
        problems, summary = self._reconciled(self.MILLIY)
        assert problems == []
        assert summary == (
            "Xonada milliy uslubga mos ravishda gul naqshli oboy va iliq rangli yelkan parket pol tanlandi. "
            "Asosiy yoritish uchun qandil va devor bra chiroqlari ishlatildi. Mebel sifatida milliy uslubdagi Samarqand "
            "divan, Buxoro kreslosi, o'ymakor jurnal stoli, Buxoro naqshli gilam va bezak uchun pufik tanlandi."
        )

    def test_klassik_keeps_its_gold(self):
        problems, summary = self._reconciled(self.KLASSIK)
        assert problems == []
        assert summary == (
            "Bu klassik dizayn uchun damask naqshli oboy va oltin rangdagi aksent rang tanlandi. Pol uchun yelkan "
            "naqshli parket yog'ochi va iliq jigarrang tus tanlandi. Asosiy yoritish uchun qandil, devor uchun bra va "
            "burchak uchun torsher chiroqlari tanlandi. Mebellar orasida klassik uslubdagi Chester divan, Barokko "
            "kreslo, zarhal jurnal stoli, Oxford kitob shkafi va Fors gilami mavjud."
        )

    def test_zamonaviy_keeps_its_uzbek(self):
        problems, summary = self._reconciled(self.ZAMONAVIY)
        assert problems == []
        assert summary == self.ZAMONAVIY.summary.rsplit(" This selection", 1)[0]

    def test_bolalar_keeps_its_uzbek(self):
        problems, summary = self._reconciled(self.BOLALAR)
        assert problems == []
        assert summary == (
            "Xonada iliq va yorqin atmosfera yaratish uchun och ko'k rangda devor bo'yoq ishlatildi. Yog'och polga "
            "o'xshash, light blue rangga yaqin laminat to'g'ri taxta naqshida tanlandi. Asosiy yoritish uchun shift "
            "chirog'i, yordamchi sifatida devorga o'rnatilgan bra chiroqlari tanlandi. Mebellar orasida bolalar "
            "karavoti, kitob javoni, o'yin stoli va stul hamda bezak sifatida pufik joylandi."
        )

    def test_yotoq_2_loses_its_english_but_still_names_a_desk_the_plan_does_not_hold(self):
        # The plan holds a dressing table, not the writing desk the Uzbek names: that is a real lie,
        # and the sentence that tells it goes. The walls, floor and lights before it are honest and stay.
        menu = ["ZZ Karavot Verona 160", "ZZ Tuvalet stoli Verona", "ZZ Yozuv stoli Nord", "ZZ Stul"]
        plan = SimpleNamespace(**vars(self.YOTOQ_2))
        problems = txt.reconcile_summary(plan, menu)
        assert problems == ["'yozuv' aytilgan, lekin rejada yo'q"]
        assert plan.summary == (
            "Yotoqxona uchun iliq va tinchlantiruvchi atmosfera yaratish maqsadida devorlar uchun ochiq pastel bej "
            "rangli bo'yoq tanlandi va pol uchun to'q jigarrang yelkan naqshli parket tanlandi. Markaziy qandil va eshik "
            "devorida joylashgan bra yordamchi yoritgich sifatida tanlandi, bu esa xonaga iliq va qulay yorug'lik beradi."
        )

    def test_yotoq_2_without_the_desk_is_kept(self):
        problems, summary = self._reconciled(self.YOTOQ_2)
        assert problems == []
        assert summary.endswith("yozuv stoli va oddiy stul tanlandi.")

    def test_a_summary_wholly_in_english_still_falls_back(self):
        plan = make("The walls are painted beige. The floor is parquet with a chandelier and furniture.")
        assert any("o'zbekcha emas" in p for p in txt.reconcile_summary(plan))
        assert plan.summary == txt.describe_plan(plan)

    def test_a_one_word_remainder_is_not_kept(self):
        plan = make("Iliq. The walls are painted beige with a warm floor and lighting.")
        assert txt.reconcile_summary(plan)
        assert plan.summary == txt.describe_plan(plan)

    def test_a_raw_piece_id_is_a_leak(self):
        assert any("ichki nom" in p for p in txt.summary_problems("F1 divan markazda turadi.", make()))

    def test_a_shop_name_with_a_label_in_it_is_no_leak(self):
        # "Divan F1 Lux" is the shop's own name: the label is part of it, not the prompt's F1.
        text = "Divan F1 Lux burchakda turadi, devorlar bej va pol parket."
        plan = _eval_plan(text, {"main": {"type": "paint", "color": "#e8dcc8"}},
                          {"type": "parquet", "pattern": None, "tint": None}, [], ["Divan F1 Lux"])
        assert txt.reconcile_summary(plan, ["Divan F1 Lux", "Kreslo F2"]) == []
        assert plan.summary == text
        # A label of no name, or of a piece the plan did not choose, is still the prompt's.
        assert any("ichki nom" in p for p in txt.summary_problems("Divan F1 Lux va F3 burchakda.", plan, ["Divan F1 Lux"]))

    def test_a_label_in_a_catalog_name_is_no_leak(self):
        plan = _eval_plan("", {"main": {"type": "paint", "color": "#e8dcc8"}}, None, [], ["Divan"])
        assert not any("ichki nom" in p for p in txt.summary_problems("Kreslo F2 yo'q.", plan, ["Divan", "Kreslo F2"]))

    def test_a_clean_summary_is_unchanged(self):
        text = "Iliq bej devorlar, parket pol. Markazda qandil 2.5 metr balandlikda, divan va tumba bilan."
        plan = make(text)
        assert txt.reconcile_summary(plan) == []
        assert plan.summary == text


class TestColourWordsThatAreNotThePaint:
    """Two eval summaries (2026-10-26) thrown away for a colour word that made no claim about the paint."""

    YOTOQ = _eval_plan(
        "Bu zamonaviy yotoqxona uchun devorlar engil ko'k-yashil rangda bo'yoq bilan qoplangan, bu xona atmosferasini "
        "tinch va shinam qiladi. Pol herringbone naqshli parketdan tanlandi, iliqlik va tabiiylikni oshirish uchun. "
        "Markaziy shift chirog'i va burchakda joylashgan torsher yordamida yumshoq va iliq yorug'lik ta'minlandi. Mebel "
        "sifatida zamonaviy uslubdagi karavot Grafit, kiyim shkafi Grafit, tumbochka Grafit, pufik bezak, yozuv stoli "
        "Nord va ish stuli tanlandi, ular bir-biri bilan uyg'un va funktsional.",
        {"main": {"type": "paint", "color": "#c9d6d5"}},
        {"type": "parquet", "pattern": "herringbone", "tint": "#8b6d5c"},
        ["ceiling", "floor_lamp"],
        ["ZZ Karavot Grafit 180", "ZZ Kiyim shkafi Grafit", "ZZ Tumbochka Grafit", "ZZ Pufik", "ZZ Ish stuli",
         "ZZ Yozuv stoli Nord"],
        {"ceiling": {"design": "floating"}, "skirting": {"id": "b054"}, "cornice": {"id": "t140"}},
    )
    LOFT = _eval_plan(
        "Devorlar uchun to'q kulrang bo'yoq va C devori uchun g'isht rangida aksent tanlandi, bu loft uslubining "
        "industriyal ko'rinishini ta'kidlaydi. Pol uchun beton qoldirildi, u qora metall va g'isht elementlari bilan "
        "uyg'unlashadi. Asosiy yoritish uchun trek chiroqlari, burchaklarda esa torsher va devor uchun spot chiroqlar "
        "ishlatildi. Mebel sifatida ZZ Divan Bruklin, ZZ Kreslo Indastrial, metall-yog'och jurnal stoli, ZZ TV tumba "
        "Indastrial va ZZ Stellaj Loft tanlandi, ular loft uslubiga mos keladi va xona o'lchamiga mos keladi.",
        {"main": {"type": "paint", "color": "#4a4a4a"}, "accent": {"wall": "C", "color": "#a0522d"}},
        {"type": "concrete", "pattern": None, "tint": None},
        ["track", "floor_lamp", "spotlight"],
        ["ZZ Divan Bruklin", "ZZ Kreslo Indastrial", "ZZ Jurnal stoli metall-yog'och", "ZZ TV tumba Indastrial",
         "ZZ Stellaj Loft"],
        {"ceiling": {"design": "non_drop"}, "skirting": {"id": "tekis"}, "cornice": None},
    )

    def test_the_namer_calls_the_yotoq_wall_light_blue(self):
        # Hue 175: just past the green band, so "ko'k-yashil" is the honest word for it.
        assert txt.colour_name("#c9d6d5") == "och ko'k"

    def test_yotoq_is_kept(self):
        plan = SimpleNamespace(**vars(self.YOTOQ))
        assert txt.reconcile_summary(plan) == []
        assert "ko'k-yashil rangda" in plan.summary

    def test_loft_is_kept_with_its_brick(self):
        plan = SimpleNamespace(**vars(self.LOFT))
        assert txt.reconcile_summary(plan) == []
        assert "qora metall va g'isht elementlari" in plan.summary

    @pytest.mark.parametrize("compound", ["ko'k-yashil", "yashil-ko'k", "ko‘k-yashil"])
    def test_a_compound_is_backed_when_either_part_is(self, compound):
        plan = SimpleNamespace(walls={"main": {"type": "paint", "color": "#c9d6d5"}}, floor=None)
        assert txt._colour_problems(txt._norm(f"Devorlar {compound} rangda."), plan) == []

    def test_a_compound_neither_part_of_which_fits_is_still_caught(self):
        plan = SimpleNamespace(walls={"main": {"type": "paint", "color": "#c9d6d5"}}, floor=None)
        assert txt._colour_problems("devorlar qizil-pushti rangda.", plan)

    @pytest.mark.parametrize("text", [
        "qora metall oyoqlar xonaga qat'iylik beradi.", "oq marmar yuzali stol.", "qora metall va g'isht.",
        "kulrang beton pol.", "qora mramor, xrom va shisha.", "qora charm qoplamali.", "qora shisha eshikchalar.",
        "qora xromli detallar.", "qora yog'ochdan yasalgan.", "qizil marmar.",
    ])
    def test_a_colour_of_a_material_is_not_the_paint(self, text):
        plan = SimpleNamespace(walls={"main": {"type": "paint", "color": "#3a5fcd"}}, floor={"type": "concrete"})
        assert txt._colour_problems(text, plan) == []

    def test_a_wrong_colour_of_the_walls_is_still_caught(self):
        plan = SimpleNamespace(walls={"main": {"type": "paint", "color": "#3a5fcd"}}, floor=None)
        assert txt._colour_problems("qizil devor va qora metall.", plan)
        assert txt._colour_problems("devorlar qora, metall oyoqli stol.", plan)


    @pytest.mark.parametrize("text", [
        "Devorlar oq rangda. Bir devor qora metall panel bilan ajratiladi.",
        "Devorlar oq, qizil yog'och panel.",
        "Aksent devor qora marmar ko'rinishida.",
    ])
    def test_a_material_on_a_wall_is_still_the_wall_colour(self, text):
        plan = SimpleNamespace(walls={"main": {"type": "paint", "color": "#ffffff"}}, floor=None)
        assert txt._colour_problems(txt._norm(text), plan)

    def test_a_material_beside_a_wall_in_another_clause_is_not(self):
        plan = SimpleNamespace(walls={"main": {"type": "paint", "color": "#ffffff"}}, floor=None)
        assert txt._colour_problems("devorlar oq rangda, qora metall oyoqli stol.", plan) == []


class TestFloorIdsAreSaidInUzbek:
    """The eval (2026-10-26) kept "Pol tile turi tanlangan": the floor's id, read as it is in the studio."""

    def test_the_minimalist_case(self):
        text = "Pol tile turi tanlangan, naqshsiz va rangsiz, bu xona yorqinligini ta'minlaydi."
        assert txt._localise(text) == "Pol kafel turi tanlangan, naqshsiz va rangsiz, bu xona yorqinligini ta'minlaydi."

    @pytest.mark.parametrize(("raw", "said"), [
        ("tile", "kafel"), ("concrete", "beton"), ("parquet", "parket"), ("laminate", "laminat"), ("Tile", "kafel"),
    ])
    def test_each_floor_type_mid_sentence(self, raw, said):
        assert txt._localise(f"Polga {raw} tanlandi.") == f"Polga {said} tanlandi."

    def test_a_floor_id_starting_a_sentence_keeps_its_capital(self):
        # The neoklassik summary of the eval came out as "... tanlandi. parket pol yelkan naqshida".
        assert txt._localise("Devorlar bej. Parquet pol herringbone naqshida.") == "Devorlar bej. Parket pol yelkan naqshida."
        assert txt._localise("Tile pol salqin.") == "Kafel pol salqin."

    def test_only_whole_words(self):
        assert txt._localise("Tiles va tilet.") == "Tiles va tilet."

    def test_the_minimalist_summary_is_kept_in_uzbek(self):
        plan = make("Pol tile turi tanlangan, naqshsiz va rangsiz.", floor={"type": "tile", "pattern": None, "tint": None})
        assert txt.reconcile_summary(plan) == []
        assert plan.summary == "Pol kafel turi tanlangan, naqshsiz va rangsiz."


class TestAWardrobeIsNotABookcase:
    """The bolalar eval run (2026-10-26) said "kiyim shkafi" for a chosen "ZZ Bolalar kitob javoni": one
    word for every cupboard let a bookcase back a wardrobe."""

    BOLALAR = _eval_plan(
        "Bu dizayn bolalar xonasi uchun yumshoq pastel ko'k devor rangi va iliq yog'och laminat pol bilan tanlandi. "
        "Yorqin atmosfera uchun markaziy shift chirog'i va ikki devor chiroqlari (bra) qo'shildi. Mebel sifatida "
        "bolalar karavoti, kiyim shkafi, yozuv stoli, ish stuli va pufik tanlandi, bu kombinatsiya bolalar uchun "
        "qulay va funktsional makon yaratadi.",
        {"main": {"type": "paint", "color": "#c3ddf9"}},
        {"type": "laminate", "pattern": "wood_strip", "tint": "#f4ead5"},
        ["ceiling", "bra", "bra"],
        ["ZZ Bolalar karavoti", "ZZ Bolalar kitob javoni", "ZZ Yozuv stoli Nord", "ZZ Ish stuli", "ZZ Pufik"],
        {"ceiling": {"design": "flat"}, "skirting": {"id": "tekis"}, "cornice": {"id": "t140"}},
    )

    @staticmethod
    def _with(*names):
        return _eval_plan("", {"main": {"type": "paint", "color": "#e8dcc8"}}, None, [], list(names))

    def test_the_real_bolalar_summary_is_caught_for_its_wardrobe(self):
        problems = txt.summary_problems(self.BOLALAR.summary, self.BOLALAR)
        assert problems == ["'kiyim shkaf' aytilgan, lekin rejada yo'q"]

    @pytest.mark.parametrize("text", ["Burchakda kiyim shkafi.", "Garderob devor oldida."])
    def test_a_wardrobe_is_backed_only_by_a_wardrobe(self, text):
        assert txt.summary_problems(text, self._with("ZZ Stellaj Loft", "ZZ Kitob shkafi Oxford"))
        assert not txt.summary_problems(text, self._with("ZZ Kiyim shkafi Nord"))

    @pytest.mark.parametrize("text", ["Devorda kitob javoni.", "Kitob shkafi burchakda.", "Stellaj va vitrina."])
    def test_a_shelf_is_backed_only_by_a_shelf(self, text):
        assert txt.summary_problems(text, self._with("ZZ Kiyim shkafi Nord"))

    def test_a_bookcase_backs_a_book_shelf(self):
        assert not txt.summary_problems("Devorda kitob javoni turadi.", self._with("Kitob shkafi"))

    def test_a_plain_cupboard_is_backed_by_either(self):
        for name in ("ZZ Kiyim shkafi Nord", "Kitob shkafi", "ZZ Oshxona shkafi"):
            assert not txt.summary_problems("Burchakda shkaf turadi.", self._with(name))
        assert txt.summary_problems("Burchakda shkaf turadi.", self._with("ZZ Pufik"))


class TestTheStyleOfTheFurniture:
    """The minimalist eval run (2026-10-26) called all its pieces "minimalist uslubdagi". The catalog styles
    them minimalist (Divan Line, Jurnal stoli Mono), unstyled (Stul) and skandinav (the rest), so the
    sentence passes as it is; were every piece skandinav it would be a lie."""

    MINIMALIST = _eval_plan(
        "Ushbu minimalist mehmonxona dizayni uchun devorlar oq rangda, C devori esa yengil aksent rang bilan "
        "bo'yalgan. Pol plitkadan tanlandi, bu xona uchun soddalik va tozalikka urg'u beradi. Asosiy yorug'lik LED "
        "panel va devor bo'ylab downlightlardan iborat bo'lib, yorug'lik xonani yorqin va zamonaviy qiladi. Mebel "
        "sifatida minimalist uslubdagi ZZ Divan Line, ZZ Jurnal stoli Mono, ZZ Stul, ZZ Javon Nord, ZZ Gilam jun och "
        "va ZZ TV tumba Nord tanlandi. Bu elementlar xonada zamonaviy va tartibli atmosfera yaratadi.",
        {"main": {"type": "paint", "color": "#ffffff"}, "accent": {"wall": "C", "color": "#e8e8e8"}},
        {"type": "tile", "pattern": None, "tint": None},
        ["led_panel", "downlight"],
        ["ZZ Divan Line", "ZZ Jurnal stoli Mono", "ZZ Stul", "ZZ Javon Nord", "ZZ Gilam jun och", "ZZ TV tumba Nord"],
        {"ceiling": {"design": "non_drop", "settings": {"color": "#ffffff"}}, "skirting": {"id": "tekis"}, "cornice": None},
    )
    # The catalog's own styles of the six pieces (eval.json).
    CATALOG_STYLES = {
        "ZZ Divan Line": ["minimalist"], "ZZ Jurnal stoli Mono": ["minimalist"], "ZZ Stul": [],
        "ZZ Javon Nord": ["skandinav"], "ZZ Gilam jun och": ["skandinav"], "ZZ TV tumba Nord": ["skandinav"],
    }
    ALL_SKANDINAV = {name: ["skandinav"] for name in CATALOG_STYLES}

    def test_the_real_minimalist_summary_is_caught_when_no_piece_is_minimalist(self):
        problems = txt.summary_problems(self.MINIMALIST.summary, self.MINIMALIST, piece_styles=self.ALL_SKANDINAV)
        assert problems == ["'Minimalist' uslubdagi mebel aytilgan, lekin tanlangan mebel bu uslubda emas"]

    def test_with_the_catalog_s_own_styles_it_passes(self):
        assert txt.summary_problems(self.MINIMALIST.summary, self.MINIMALIST, piece_styles=self.CATALOG_STYLES) == []

    @pytest.mark.parametrize("text", [
        "Ushbu minimalist mehmonxona dizayni uchun devorlar oq rangda.",
        "Skandinav uslubidagi xona yorug' va sokin.",
    ])
    def test_the_style_of_the_room_is_not_a_claim_about_the_furniture(self, text):
        assert txt.summary_problems(text, self.MINIMALIST, piece_styles={n: ["loft"] for n in self.CATALOG_STYLES}) == []

    @pytest.mark.parametrize("text", [
        "Minimalist divan va stol tanlandi.", "Mebel minimalist ruhda.", "Minimalist uslubdagi Line va Mono tanlandi.",
    ])
    def test_each_way_of_giving_furniture_a_style_is_read(self, text):
        assert txt.summary_problems(text, self.MINIMALIST, piece_styles=self.ALL_SKANDINAV)

    def test_one_piece_of_that_style_backs_it(self):
        styles = {**self.ALL_SKANDINAV, "ZZ Stul": ["minimalist", "zamonaviy"]}
        assert not txt.summary_problems("Minimalist uslubdagi mebel tanlandi.", self.MINIMALIST, piece_styles=styles)

    def test_an_unstyled_piece_suits_every_style(self):
        styles = {**self.ALL_SKANDINAV, "ZZ Stul": []}
        assert not txt.summary_problems("Minimalist uslubdagi mebel tanlandi.", self.MINIMALIST, piece_styles=styles)

    def test_without_the_styles_nothing_is_checked(self):
        assert not txt.summary_problems("Minimalist uslubdagi mebel tanlandi.", self.MINIMALIST)

    def test_reconcile_passes_the_styles_on(self):
        plan = SimpleNamespace(**vars(self.MINIMALIST))
        assert txt.reconcile_summary(plan, list(self.CATALOG_STYLES), self.ALL_SKANDINAV)

    async def test_design_room_reads_the_styles_from_the_catalog(self):
        items = [{**ITEMS[0], "styles": ["loft"]}, *ITEMS[1:]]
        reply = TestDesignRoomEndToEnd()._reply("Iliq bej devorlar va parket pol. Minimalist uslubdagi divan tanlandi.")
        with patch("app.services.ai_designer.call_llm", new=AsyncMock(return_value=reply)):
            plan = await ad.design_room("iliq", TestDesignRoomEndToEnd.ROOM, items, user_id="u")
        assert "minimalist" not in plan.summary.lower()


class TestOnlyTheWrongSentenceGoes:
    """One false sentence cost the whole summary: the honest sentences around it are kept now."""

    MINIMALIST = TestTheStyleOfTheFurniture.MINIMALIST
    BOLALAR = TestAWardrobeIsNotABookcase.BOLALAR

    def test_minimalist_loses_only_its_furniture_style_sentence(self):
        plan = SimpleNamespace(**vars(self.MINIMALIST))
        problems = txt.reconcile_summary(plan, None, TestTheStyleOfTheFurniture.ALL_SKANDINAV)
        assert problems == ["'Minimalist' uslubdagi mebel aytilgan, lekin tanlangan mebel bu uslubda emas"]
        assert plan.summary == (
            "Ushbu minimalist mehmonxona dizayni uchun devorlar oq rangda, C devori esa yengil aksent rang bilan "
            "bo'yalgan. Pol plitkadan tanlandi, bu xona uchun soddalik va tozalikka urg'u beradi. Asosiy yorug'lik LED "
            "panel va devor bo'ylab downlightlardan iborat bo'lib, yorug'lik xonani yorqin va zamonaviy qiladi. Bu "
            "elementlar xonada zamonaviy va tartibli atmosfera yaratadi."
        )

    def test_bolalar_loses_only_its_wardrobe_sentence(self):
        plan = SimpleNamespace(**vars(self.BOLALAR))
        assert txt.reconcile_summary(plan) == ["'kiyim shkaf' aytilgan, lekin rejada yo'q"]
        assert plan.summary == (
            "Bu dizayn bolalar xonasi uchun yumshoq pastel ko'k devor rangi va iliq yog'och laminat pol bilan tanlandi. "
            "Yorqin atmosfera uchun markaziy shift chirog'i va ikki devor chiroqlari (bra) qo'shildi."
        )

    def test_a_summary_wrong_in_every_sentence_falls_back(self):
        plan = make("Oltin detallar xonani bezaydi. Plitka pol salqin. Bra devorda.")
        problems = txt.reconcile_summary(plan)
        assert len(problems) == 3
        assert plan.summary == txt.describe_plan(plan)

    def test_a_lone_word_left_is_not_kept(self):
        plan = make("Iliq. Oltin detallar xonani bezaydi.")
        assert txt.reconcile_summary(plan)
        assert plan.summary == txt.describe_plan(plan)

    def test_a_wrong_claim_spread_over_sentences_falls_back(self):
        # No sentence is English enough alone, the whole is: the remainder is checked again and fails.
        plan = make("Devorlar bej, the parket. Pol parket, the qandil. Qandil and divan.")
        assert any("o'zbekcha emas" in p for p in txt.reconcile_summary(plan))
        assert plan.summary == txt.describe_plan(plan)

    def test_a_clean_summary_of_many_sentences_is_unchanged(self):
        text = "Iliq bej devorlar. Parket pol shevron naqshida. Markazda qandil, divan va tumba."
        plan = make(text)
        assert txt.reconcile_summary(plan) == []
        assert plan.summary == text

    def test_what_is_kept_never_trips_the_check(self):
        plan = SimpleNamespace(**vars(self.BOLALAR))
        txt.reconcile_summary(plan)
        assert plan.summary != txt.describe_plan(plan)
        assert txt.summary_problems(plan.summary, plan) == []

    @pytest.mark.parametrize(("summary", "event"), [
        ("Iliq bej devorlar va parket pol. Oltin chiroq xonani bezaydi.", "ai_design.summary_trimmed"),
        ("Oltin chiroq xonani bezaydi.", "ai_design.summary_replaced"),
    ])
    async def test_the_log_tells_a_trim_from_a_replacement(self, summary, event):
        from structlog.testing import capture_logs

        reply = TestDesignRoomEndToEnd()._reply(summary)
        with patch("app.services.ai_designer.call_llm", new=AsyncMock(return_value=reply)), capture_logs() as logs:
            await ad.design_room("iliq", TestDesignRoomEndToEnd.ROOM, ITEMS, user_id="u")
        events = [e for e in logs if e["event"].startswith("ai_design.summary_")]
        assert [e["event"] for e in events] == [event] and events[0]["problems"]
