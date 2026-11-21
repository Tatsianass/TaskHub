"""Starts the Expo web build in local mode (data in the browser's storage), so the tests need no API
server or database. Server-mode flows are covered by server/test."""

import os
import signal
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest
from playwright.sync_api import Page, expect

PORT = 8099
BASE_URL = f"http://localhost:{PORT}"
ROOT = Path(__file__).resolve().parent.parent


def _is_up() -> bool:
    try:
        with urllib.request.urlopen(BASE_URL, timeout=2):
            return True
    except (urllib.error.URLError, OSError):
        return False


@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


@pytest.fixture(scope="session", autouse=True)
def web_server():
    if _is_up() and not os.environ.get("CI"):
        yield  # reuse a dev server that is already running
        return
    proc = subprocess.Popen(
        ["npx", "expo", "start", "--web", "--port", str(PORT)],
        cwd=ROOT,
        env={**os.environ, "EXPO_PUBLIC_STORAGE_MODE": "local", "CI": "1"},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    try:
        deadline = time.time() + 180
        while not _is_up():
            if proc.poll() is not None:
                raise RuntimeError("expo start exited before the web server came up")
            if time.time() > deadline:
                raise TimeoutError("expo web server did not start within 180 s")
            time.sleep(1)
        yield
    finally:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    return {**browser_context_args, "viewport": {"width": 420, "height": 860}}


_SEED_LOCALE = "if (!localStorage.getItem('settings:locale')) localStorage.setItem('settings:locale', 'en');"
_SEED_ONBOARDING = (
    "if (!localStorage.getItem('onboarding:seen:local')) localStorage.setItem('onboarding:seen:local', 'true');"
)


@pytest.fixture
def app(page: Page) -> Page:
    """A returning English-speaking user: intro slides marked seen and the language fixed, so
    assertions don't depend on the default locale. The seed only fills missing keys, so reloads
    keep what the test saved."""
    page.add_init_script(_SEED_LOCALE + _SEED_ONBOARDING)
    page.goto("/")
    expect(page.get_by_text("TaskHub", exact=True)).to_be_visible()
    return page


@pytest.fixture
def fresh(page: Page) -> Page:
    """First-launch state: intro slides not seen yet."""
    page.add_init_script(_SEED_LOCALE)
    page.goto("/")
    return page
