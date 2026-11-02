import { addTask, expect, test } from './fixtures';

const tab = (page: import('@playwright/test').Page, name: string) => page.getByRole('tab', { name, exact: true });

test('the bottom tabs switch between the four screens', async ({ app: page }) => {
  await tab(page, 'Calendar').click();
  await expect(page.getByLabel('Next month')).toBeVisible();

  await tab(page, 'Celebrations').click();
  await expect(page.getByText('No one here yet. Tap "+" to add.')).toBeVisible();

  await tab(page, 'Settings').click();
  await expect(page.getByText('Language', { exact: true })).toBeVisible();

  await tab(page, 'Tasks').click();
  await expect(page.getByTestId('add-task')).toBeVisible();
});

test('a task due today shows up in the calendar', async ({ app: page }) => {
  await addTask(page, 'Team meeting', { when: 'Today' });
  await tab(page, 'Calendar').click();
  // The Tasks tab stays mounted underneath, so the calendar's list is the second copy.
  await expect(page.getByText('Team meeting', { exact: true })).toHaveCount(2);
});
