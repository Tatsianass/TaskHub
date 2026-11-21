import re

from playwright.sync_api import Page, expect

from helpers import add_task, expect_no_task, expect_task, quadrant_tab, task_title


def test_a_new_task_lands_in_urgent_and_survives_a_reload(app: Page):
    page = app
    add_task(page, "Pay rent")
    expect_task(page, "Pay rent")
    page.reload()
    expect_task(page, "Pay rent")


def test_the_quadrant_follows_importance_and_date(app: Page):
    page = app
    add_task(page, "Read a book", important=False, when="No date")
    expect_no_task(page, "Read a book")
    quadrant_tab(page, "Later").click()
    expect_task(page, "Read a book")

    add_task(page, "Plan the trip", important=True, when="No date")
    quadrant_tab(page, "Planned").click()
    expect_task(page, "Plan the trip")


def test_an_empty_title_cannot_be_saved(app: Page):
    page = app
    page.get_by_test_id("add-task").click()
    expect(page.get_by_text("Add task", exact=True)).to_be_visible()
    expect(page.locator('[aria-disabled="true"]', has_text="Add task")).to_be_visible()


def test_editing_a_task_changes_its_title(app: Page):
    page = app
    add_task(page, "Call dentist")
    task_title(page, "Call dentist").click()
    expect(page.get_by_text("Edit task", exact=True)).to_be_visible()
    page.get_by_placeholder("What needs to be done?").fill("Call the doctor")
    page.get_by_text("Save", exact=True).click()
    expect_task(page, "Call the doctor")
    expect_no_task(page, "Call dentist")


def test_deleting_a_task_removes_it(app: Page):
    page = app
    add_task(page, "Old errand")
    task_title(page, "Old errand").click()
    page.get_by_test_id("task-form-delete").click()
    expect_no_task(page, "Old errand")
    page.reload()
    expect_no_task(page, "Old errand")


def test_the_tag_filter_narrows_the_list(app: Page):
    page = app
    add_task(page, "Write report", tag="Work")
    add_task(page, "Wash dishes", tag="Home")
    page.get_by_text(re.compile(r"Work$")).first.click()
    expect_task(page, "Write report")
    expect_no_task(page, "Wash dishes")
    page.get_by_text("All", exact=True).click()
    expect_task(page, "Wash dishes")


def test_a_fourth_task_in_one_quadrant_asks_to_swap_or_add_anyway(app: Page):
    page = app
    for title in ["One", "Two", "Three"]:
        add_task(page, title)
    page.get_by_test_id("add-task").click()
    page.get_by_placeholder("What needs to be done?").fill("Four")
    expect(page.get_by_text("Already 3 active tasks here")).to_be_visible()
    page.get_by_text("Add anyway", exact=True).click()
    page.get_by_text("Add task", exact=True).click()
    expect_task(page, "Four")
