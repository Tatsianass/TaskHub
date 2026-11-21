from playwright.sync_api import Page, expect

from helpers import expect_task, quadrant_tab, task_title


def test_completing_a_repeating_task_brings_back_the_next_one_and_undo_removes_it(app: Page):
    page = app
    page.get_by_test_id("add-task").click()
    page.get_by_placeholder("What needs to be done?").fill("Pay rent")
    page.get_by_test_id("repeat-monthly").click()
    page.get_by_text("Add task", exact=True).click()
    expect_task(page, "Pay rent")
    expect(task_title(page, "Pay rent")).to_have_count(1)

    page.get_by_test_id("task-checkbox").first.click()
    # The finished one stays struck through for the day; the next month's copy is now there too.
    expect(task_title(page, "Pay rent")).to_have_count(2)

    page.get_by_text("Undo", exact=True).click()
    expect(task_title(page, "Pay rent")).to_have_count(1)


def test_repeat_is_disabled_until_the_task_has_a_date(app: Page):
    page = app
    page.get_by_test_id("add-task").click()
    page.get_by_text("No date", exact=True).click()
    expect(page.get_by_text("Pick a date to repeat the task")).to_be_visible()
    page.get_by_placeholder("What needs to be done?").fill("Water plants")
    page.get_by_text("Daily", exact=True).click(force=True)
    page.get_by_text("Add task", exact=True).click()
    quadrant_tab(page, "Planned").click()
    task_title(page, "Water plants").click()
    expect(page.get_by_text("Pick a date to repeat the task")).to_be_visible()
