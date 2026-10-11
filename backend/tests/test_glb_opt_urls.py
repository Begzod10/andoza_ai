"""A model's compressed copy is what clients are sent, when there is one.

The original GLB is never touched: the compressed copy sits beside it as
``<key>.opt.glb`` and every URL builder prefers it, falling back to the
original until (or unless) the copy exists.
"""
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

from app.core.model_files import model_keys, opt_key_for, served_key
from app.models.furniture import Furniture
from app.models.user_model import UserModel


def _request():
    request = MagicMock()
    request.base_url = "http://test/"
    return request


def _furniture(opt: str | None) -> Furniture:
    return Furniture(
        id=uuid.uuid4(), store_id=None, category="divan", room_type=None, placement="pol",
        name_uz="Divan", price_uzs=None, glb_key="furniture/a.glb", glb_opt_key=opt,
        thumbnail_key=None, footprint_w=None, footprint_d=None, height_cm=None,
        is_active=True, status="approved", created_at=datetime.now(timezone.utc),
    )


def _user_model(opt: str | None) -> UserModel:
    return UserModel(
        id=uuid.uuid4(), user_id=uuid.uuid4(), name="Stul", category=None, placement=None,
        price_uzs=None, scale=1.0, size_w_m=1.0, size_d_m=1.0, size_h_m=1.0, has_textures=False,
        storage_key="models/u/a.glb", opt_key=opt, thumb_key=None, content_type="model/gltf-binary",
        size_bytes=10, sha256="x" * 64, created_at=datetime.now(timezone.utc),
    )


class TestKeys:
    def test_the_copy_sits_beside_the_original(self):
        assert opt_key_for("furniture/a.glb") == "furniture/a.opt.glb"
        assert opt_key_for("x") == "x.opt.glb"

    def test_the_copy_is_served_when_there_is_one(self):
        assert served_key("a.glb", None) == "a.glb"
        assert served_key("a.glb", "a.opt.glb") == "a.opt.glb"

    def test_both_files_go_when_a_model_is_deleted(self):
        assert model_keys("a.glb", "a.opt.glb") == ["a.glb", "a.opt.glb"]
        assert model_keys("a.glb", None) == ["a.glb"]
        assert model_keys(None, None) == []


class TestUrls:
    def test_catalog(self):
        from app.routers.catalog import _furniture_out

        assert _furniture_out(_request(), _furniture("furniture/a.opt.glb")).glb_url.endswith("/furniture/a.opt.glb")
        plain = _furniture_out(_request(), _furniture(None)).glb_url
        assert plain.endswith("/furniture/a.glb") and not plain.endswith(".opt.glb")

    def test_admin(self):
        from app.routers.admin_catalog import _furniture_out

        assert _furniture_out(_furniture("furniture/a.opt.glb"), _request(), None).glb_url.endswith(".opt.glb")
        assert not _furniture_out(_furniture(None), _request(), None).glb_url.endswith(".opt.glb")

    def test_seller(self):
        from app.routers.seller import _out

        assert _out(_furniture("furniture/a.opt.glb"), _request()).glb_url.endswith(".opt.glb")
        assert not _out(_furniture(None), _request()).glb_url.endswith(".opt.glb")

    def test_user_model(self):
        from app.routers.user_models import _out

        assert _out(_user_model("models/u/a.opt.glb"), _request()).url.endswith("/models/u/a.opt.glb")
        assert not _out(_user_model(None), _request()).url.endswith(".opt.glb")
