import { expect, test as base, type Page } from '@playwright/test';

/**
 * Starts every test as a returning English-speaking user: the intro slides are marked seen and the
 * language is fixed, so assertions don't depend on the default locale. `fresh` keeps the first-launch
 * state instead. The seed only fills missing keys, so reloads keep what the test saved.
 */
export const test = base.extend<{ app: Page; fresh: Page }>({
  app: async ({ page }, use) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('settings:locale')) localStorage.setItem('settings:locale', 'en');
      if (!localStorage.getItem('onboarding:seen:local')) localStorage.setItem('onboarding:seen:local', 'true');
    });
    await page.goto('/');
    await expect(page.getByText('TaskHub', { exact: true })).toBeVisible();
    await use(page);
  },
  fresh: async ({ page }, use) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('settings:locale')) localStorage.setItem('settings:locale', 'en');
    });
    await page.goto('/');
    await use(page);
  },
});

export { expect };

/** Opens the new-task form from the header "+" and saves a task with the given options. */
export async function addTask(
  page: Page,
  title: string,
  opts: { important?: boolean; when?: 'Today' | 'Tomorrow' | 'No date'; tag?: 'Work' | 'Home' } = {},
) {
  await page.getByTestId('add-task').click();
  await expect(page.getByText('New task', { exact: true })).toBeVisible();
  await page.getByPlaceholder('What needs to be done?').fill(title);
  if (opts.when) await page.getByText(opts.when, { exact: true }).click();
  if (opts.important !== undefined) await page.getByText(opts.important ? 'Important' : 'Not important', { exact: true }).click();
  if (opts.tag) await page.getByText(opts.tag, { exact: true }).click();
  await page.getByText('Add task', { exact: true }).click();
  await expect(page.getByText('New task', { exact: true })).toBeHidden();
}

export const quadrantTab = (page: Page, name: 'Urgent' | 'Planned' | 'Delegate' | 'Later') =>
  page.getByRole('tab', { name: new RegExp(`^${name}`) });

/** A task title anywhere in the DOM, including quadrants that are faded out. Use it to click a task. */
export const taskTitle = (page: Page, title: string) => page.getByText(title, { exact: true });

/**
 * How many copies of a task title the user can see. All four quadrants stay mounted and the
 * inactive ones are only faded out (opacity 0), which Playwright still counts as visible.
 */
async function shownTitles(page: Page, title: string) {
  return taskTitle(page, title).evaluateAll(
    (nodes) =>
      nodes.filter((node) => {
        let opacity = 1;
        for (let el: Element | null = node; el; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity);
        return opacity > 0.5;
      }).length,
  );
}

export const expectTask = (page: Page, title: string) => expect.poll(() => shownTitles(page, title)).toBeGreaterThan(0);
export const expectNoTask = (page: Page, title: string) => expect.poll(() => shownTitles(page, title)).toBe(0);

/** Drags a row of the Completed screen to the left to reveal its Restore / Delete actions. */
export async function swipeRowLeft(page: Page, title: string) {
  // The Tasks screen stays mounted underneath, so the Completed screen's copy is the last one.
  const box = await page.getByText(title, { exact: true }).last().boundingBox();
  if (!box) throw new Error(`No row titled "${title}"`);
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 100, y);
  await page.mouse.down();
  await page.mouse.move(box.x - 60, y, { steps: 12 });
  await page.mouse.up();
}
