import pytest

from app.schemas.admin_catalog import normalize_styles, parse_styles_form


def test_styles_are_cleaned_deduplicated_and_ordered():
    assert normalize_styles([" Milliy", "zamonaviy", "milliy", ""]) == ["zamonaviy", "milliy"]


def test_no_styles_means_every_style():
    assert normalize_styles(None) == [] and parse_styles_form("") == [] and parse_styles_form(None) == []


def test_an_unknown_style_is_refused():
    with pytest.raises(ValueError):
        normalize_styles(["barokko"])
