import re
import time
from typing import Callable, Literal, Optional

from playwright.sync_api import Page, expect

NEW_TASK = "New task"


def add_task(
    page: Page,
    title: str,
    *,
    important: Optional[bool] = None,
    when: Optional[Literal["Today", "Tomorrow", "No date"]] = None,
    tag: Optional[Literal["Work", "Home"]] = None,
) -> None:
    """Opens the new-task form from the header "+" and saves a task with the given options."""
    page.get_by_test_id("add-task").click()
    expect(page.get_by_text(NEW_TASK, exact=True)).to_be_visible()
    page.get_by_placeholder("What needs to be done?").fill(title)
    if when:
        page.get_by_text(when, exact=True).click()
    if important is not None:
        page.get_by_text("Important" if important else "Not important", exact=True).click()
    if tag:
        page.get_by_text(tag, exact=True).click()
    page.get_by_text("Add task", exact=True).click()
    expect(page.get_by_text(NEW_TASK, exact=True)).to_be_hidden()


def quadrant_tab(page: Page, name: Literal["Urgent", "Planned", "Delegate", "Later"]):
    return page.get_by_role("tab", name=re.compile(f"^{name}"))


def task_title(page: Page, title: str):
    """A task title anywhere in the DOM, including quadrants that are faded out. Use it to click a task."""
    return page.get_by_text(title, exact=True)


_SHOWN_JS = """nodes => nodes.filter(node => {
  let opacity = 1;
  for (let el = node; el; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity);
  return opacity > 0.5;
}).length"""


def _shown_titles(page: Page, title: str) -> int:
    """How many copies of a task title the user can see. All four quadrants stay mounted and the
    inactive ones are only faded out (opacity 0), which Playwright still counts as visible."""
    return task_title(page, title).evaluate_all(_SHOWN_JS)


def _poll(read: Callable[[], int], ok: Callable[[int], bool], what: str, timeout: float = 5.0) -> None:
    deadline = time.time() + timeout
    while True:
        value = read()
        if ok(value):
            return
        if time.time() > deadline:
            raise AssertionError(f"{what} (last value: {value})")
        time.sleep(0.1)


def expect_task(page: Page, title: str) -> None:
    _poll(lambda: _shown_titles(page, title), lambda n: n > 0, f'expected "{title}" to be shown')


def expect_no_task(page: Page, title: str) -> None:
    _poll(lambda: _shown_titles(page, title), lambda n: n == 0, f'expected "{title}" to be hidden')


def swipe_row_left(page: Page, title: str) -> None:
    """Drags a row of the Completed screen to the left to reveal its Restore / Delete actions."""
    # The Tasks screen stays mounted underneath, so the Completed screen's copy is the last one.
    box = page.get_by_text(title, exact=True).last.bounding_box()
    if box is None:
        raise RuntimeError(f'No row titled "{title}"')
    y = box["y"] + box["height"] / 2
    page.mouse.move(box["x"] + 100, y)
    page.mouse.down()
    page.mouse.move(box["x"] - 60, y, steps=12)
    page.mouse.up()
