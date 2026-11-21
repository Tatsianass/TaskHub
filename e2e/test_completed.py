import re

from playwright.sync_api import Page, expect

from helpers import add_task, expect_task, swipe_row_left


def open_completed(page: Page):
    page.get_by_role("button", name="Completed tasks").click()


def test_checking_a_task_off_moves_it_to_completed_and_undo_brings_it_back(app: Page):
    page = app
    add_task(page, "Send invoice")
    page.get_by_test_id("task-checkbox").click()
    expect(page.get_by_text("Task moved to Completed")).to_be_visible()
    page.get_by_text("Undo", exact=True).click()
    expect(page.get_by_text("Task moved to Completed")).to_be_hidden()

    page.get_by_test_id("task-checkbox").click()
    open_completed(page)
    expect(page.get_by_text("1 task", exact=True)).to_be_visible()


def test_a_completed_task_can_be_restored(app: Page):
    page = app
    add_task(page, "Water plants")
    page.get_by_test_id("task-checkbox").click()
    open_completed(page)
    swipe_row_left(page, "Water plants")
    page.get_by_role("button", name="Restore").click()
    expect(page.get_by_text("Nothing completed yet")).to_be_visible()
    page.get_by_role("button", name="Back").click()
    expect_task(page, "Water plants")
    expect(page.get_by_test_id("task-checkbox")).to_be_visible()


def test_a_completed_task_can_be_deleted_from_completed(app: Page):
    page = app
    add_task(page, "Old receipt")
    page.get_by_test_id("task-checkbox").click()
    open_completed(page)
    swipe_row_left(page, "Old receipt")
    page.get_by_role("button", name="Delete").click()
    expect(page.get_by_text("Nothing completed yet")).to_be_visible()


def test_completed_tasks_can_be_cleared(app: Page):
    page = app
    add_task(page, "Take out trash")
    page.get_by_test_id("task-checkbox").click()
    open_completed(page)
    page.get_by_text("Clear", exact=True).click()
    page.get_by_text(re.compile(r"^Delete \(1\)$")).click()
    expect(page.get_by_text("Nothing completed yet")).to_be_visible()
