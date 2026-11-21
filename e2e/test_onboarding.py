from playwright.sync_api import Page, expect


def test_first_launch_shows_the_intro_slides_and_then_the_task_screen(fresh: Page):
    page = fresh
    expect(page.get_by_text("Focus on what matters")).to_be_visible()
    page.get_by_text("Next", exact=True).click()
    # The slides scroll with an animation; wait for it before pressing Next again.
    expect(page.get_by_text("Write like you think")).to_be_in_viewport(ratio=1)
    page.get_by_text("Next", exact=True).click()
    expect(page.get_by_text("We’ll nudge you in time")).to_be_in_viewport(ratio=1)
    page.get_by_text("Get started", exact=True).click()
    expect(page.get_by_test_id("add-task")).to_be_visible()


def test_skipping_the_intro_opens_the_task_screen_and_is_remembered(fresh: Page):
    page = fresh
    page.get_by_text("Skip", exact=True).click()
    expect(page.get_by_test_id("add-task")).to_be_visible()
    page.reload()
    expect(page.get_by_test_id("add-task")).to_be_visible()
    expect(page.get_by_text("Skip", exact=True)).to_be_hidden()
