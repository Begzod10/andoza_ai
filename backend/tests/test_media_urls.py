"""
Media URLs must never come back as ``http://`` to an HTTPS client.

Production served the site over TLS while uvicorn ran without
``--proxy-headers``, so ``request.base_url`` stayed ``http://`` and every
``glb_url``/``thumbnail_url`` the API returned was blocked by the browser as
mixed content — no 3-D furniture model would load. These tests pin the
application-side half of the fix, which holds even if a future deployment
forgets the uvicorn flag again.
"""
from unittest.mock import patch

from starlette.requests import Request

from app.core.storage import absolute_media_url, request_base_url


def _request(scheme: str = "http", host: str = "andoza.jumaniyozov.uz", **headers) -> Request:
    raw_headers = [(b"host", host.encode())]
    raw_headers += [
        (name.lower().replace("_", "-").encode(), value.encode())
        for name, value in headers.items()
    ]
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": scheme,
            "path": "/api/v1/furniture",
            "raw_path": b"/api/v1/furniture",
            "query_string": b"",
            "root_path": "",
            "headers": raw_headers,
            "server": (host, 80),
            "client": ("172.18.0.1", 51234),
        }
    )


def test_forwarded_proto_https_is_honoured_even_without_proxy_headers():
    """The regression guard: nginx says https, so the URL must not be http."""
    url = absolute_media_url(
        _request(scheme="http", x_forwarded_proto="https"),
        "furniture/sofa.glb",
    )
    assert not url.startswith("http://")
    assert url == "https://andoza.jumaniyozov.uz/media/furniture/sofa.glb"


def test_first_hop_of_a_forwarded_proto_chain_wins():
    url = absolute_media_url(
        _request(scheme="http", x_forwarded_proto="https, http"),
        "furniture/sofa.glb",
    )
    assert url.startswith("https://")


def test_plain_http_request_without_a_proxy_stays_http():
    """Local/dev over plain HTTP must not be rewritten to an unreachable https."""
    url = absolute_media_url(_request(scheme="http", host="localhost:8000"), "furniture/sofa.glb")
    assert url == "http://localhost:8000/media/furniture/sofa.glb"


def test_forwarded_proto_never_downgrades_an_https_request():
    url = absolute_media_url(
        _request(scheme="https", x_forwarded_proto="http"),
        "furniture/sofa.glb",
    )
    assert url.startswith("https://")


def test_forwarded_host_is_ignored_so_a_forged_header_cannot_retarget_media():
    url = absolute_media_url(
        _request(scheme="http", x_forwarded_proto="https", x_forwarded_host="evil.example"),
        "furniture/sofa.glb",
    )
    assert "evil.example" not in url


def test_public_base_url_setting_overrides_the_request():
    with patch("app.core.storage.settings.PUBLIC_BASE_URL", "https://cdn.example.com/"):
        url = absolute_media_url(_request(scheme="http", host="localhost:8000"), "furniture/sofa.glb")
    assert url == "https://cdn.example.com/media/furniture/sofa.glb"


def test_urls_stay_absolute_for_the_flutter_app():
    """The mobile client feeds these straight to CachedNetworkImage."""
    url = absolute_media_url(_request(scheme="http", x_forwarded_proto="https"), "wallpapers/x.jpg")
    assert url.startswith("https://")


def test_already_absolute_s3_urls_pass_through_untouched():
    url = absolute_media_url(_request(), "https://bucket.s3.amazonaws.com/furniture/sofa.glb")
    assert url == "https://bucket.s3.amazonaws.com/furniture/sofa.glb"


def test_missing_key_is_none():
    assert absolute_media_url(_request(), None) is None


def test_request_base_url_has_no_trailing_slash():
    assert request_base_url(_request()) == "http://andoza.jumaniyozov.uz"
