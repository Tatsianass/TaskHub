from playwright.sync_api import Page, expect

from helpers import add_task


def tab(page: Page, name: str):
    return page.get_by_role("tab", name=name, exact=True)


def test_the_bottom_tabs_switch_between_the_four_screens(app: Page):
    page = app
    tab(page, "Calendar").click()
    expect(page.get_by_label("Next month")).to_be_visible()

    tab(page, "Celebrations").click()
    expect(page.get_by_text('No one here yet. Tap "+" to add.')).to_be_visible()

    tab(page, "Settings").click()
    expect(page.get_by_text("Language", exact=True)).to_be_visible()

    tab(page, "Tasks").click()
    expect(page.get_by_test_id("add-task")).to_be_visible()


def test_a_task_due_today_shows_up_in_the_calendar(app: Page):
    page = app
    add_task(page, "Team meeting", when="Today")
    tab(page, "Calendar").click()
    # The Tasks tab stays mounted underneath, so the calendar's list is the second copy.
    expect(page.get_by_text("Team meeting", exact=True)).to_have_count(2)
