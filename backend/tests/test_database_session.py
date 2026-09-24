"""get_db() session lifecycle: commit, rollback, and post-commit hooks.

The ordering pinned here is the whole point of run_after_commit(): work that
is only correct once the write is durable (catalog cache invalidation, storage
deletes) must run AFTER get_db()'s commit, never inside the handler where the
transaction is still only flushed.
"""
from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app import database
from app.database import get_db, run_after_commit


class _FakeSession:
    """Records the session calls get_db() makes, in order."""

    def __init__(self, calls: list[str]):
        self.calls = calls
        self.info: dict = {}

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False

    async def commit(self):
        self.calls.append("commit")

    async def rollback(self):
        self.calls.append("rollback")

    async def close(self):
        self.calls.append("close")


@pytest.fixture
def calls(monkeypatch):
    """Point get_db() at a recording session and hand back its call log."""
    recorded: list[str] = []
    monkeypatch.setattr(database, "AsyncSessionLocal", lambda: _FakeSession(recorded))
    return recorded


def _app(handler) -> FastAPI:
    app = FastAPI()

    @app.get("/x")
    async def endpoint(db=Depends(get_db)):  # noqa: B008 - FastAPI dependency
        return await handler(db)

    return app


def _client(handler) -> TestClient:
    # Failures are the behaviour under test — let them come back as a 500
    # response instead of being re-raised into the test.
    return TestClient(_app(handler), raise_server_exceptions=False)


class TestPostCommitOrdering:
    def test_hook_runs_after_the_commit_not_before(self, calls):
        async def handler(db):
            async def hook():
                calls.append("hook")

            run_after_commit(db, hook)
            calls.append("handler")
            return {"ok": True}

        response = _client(handler).get("/x")

        assert response.status_code == 200
        # "hook" strictly after "commit" is the race fix: a hook that ran at
        # registration time (or anywhere before the commit) would let a
        # concurrent read repopulate the cache from pre-write rows.
        assert calls == ["handler", "commit", "hook", "close"]

    def test_hooks_run_in_registration_order(self, calls):
        async def handler(db):
            for name in ("first", "second", "third"):
                # Bind `name` per iteration rather than closing over the loop
                # variable, which would make all three log "third".
                async def hook(name=name):
                    calls.append(name)

                run_after_commit(db, hook)
            return {"ok": True}

        _client(handler).get("/x")

        assert calls == ["commit", "first", "second", "third", "close"]

    def test_hooks_do_not_run_when_the_request_fails(self, calls):
        async def handler(db):
            async def hook():
                calls.append("hook")

            run_after_commit(db, hook)
            raise RuntimeError("boom")

        response = _client(handler).get("/x")

        assert response.status_code == 500
        # Nothing committed, so nothing to invalidate — and crucially the
        # rollback path is untouched by the hook machinery.
        assert calls == ["rollback", "close"]

    def test_failing_hook_is_logged_but_does_not_fail_the_request(self, calls):
        """Fail-open: the commit already happened, so a hook cannot un-write it.

        Raising here would hand the admin a 500 for a row that exists. The
        cost is bounded staleness, surfaced as `after_commit_hook_failed`.
        """

        async def boom():
            calls.append("boom")
            raise ConnectionError("redis is down")

        async def handler(db):
            async def after(name="after"):
                calls.append(name)

            run_after_commit(db, boom)
            run_after_commit(db, after)
            return {"ok": True}

        response = _client(handler).get("/x")

        assert response.status_code == 200
        # A failing hook must not swallow the ones queued behind it.
        assert calls == ["commit", "boom", "after", "close"]

    def test_hooks_are_cleared_after_running(self, calls):
        session = _FakeSession(calls)

        async def hook():
            calls.append("hook")

        run_after_commit(session, hook)
        import asyncio

        asyncio.run(database._run_after_commit_hooks(session))
        asyncio.run(database._run_after_commit_hooks(session))

        # Ran once, not once per later commit on a reused session.
        assert calls == ["hook"]
