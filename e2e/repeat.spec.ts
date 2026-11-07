import { expect, expectTask, quadrantTab, taskTitle, test } from './fixtures';

test('completing a repeating task brings back the next one, and undo removes it', async ({ app: page }) => {
  await page.getByTestId('add-task').click();
  await page.getByPlaceholder('What needs to be done?').fill('Pay rent');
  await page.getByTestId('repeat-monthly').click();
  await page.getByText('Add task', { exact: true }).click();
  await expectTask(page, 'Pay rent');
  await expect(taskTitle(page, 'Pay rent')).toHaveCount(1);

  await page.getByTestId('task-checkbox').first().click();
  // The finished one stays struck through for the day; the next month's copy is now there too.
  await expect(taskTitle(page, 'Pay rent')).toHaveCount(2);

  await page.getByText('Undo', { exact: true }).click();
  await expect(taskTitle(page, 'Pay rent')).toHaveCount(1);
});

test('repeat is disabled until the task has a date', async ({ app: page }) => {
  await page.getByTestId('add-task').click();
  await page.getByText('No date', { exact: true }).click();
  await expect(page.getByText('Pick a date to repeat the task')).toBeVisible();
  await page.getByPlaceholder('What needs to be done?').fill('Water plants');
  await page.getByText('Daily', { exact: true }).click({ force: true });
  await page.getByText('Add task', { exact: true }).click();
  await quadrantTab(page, 'Planned').click();
  await taskTitle(page, 'Water plants').click();
  await expect(page.getByText('Pick a date to repeat the task')).toBeVisible();
});

