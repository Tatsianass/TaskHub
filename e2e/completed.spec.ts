import { addTask, expect, expectTask, swipeRowLeft, test } from './fixtures';

const openCompleted = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Completed tasks' }).click();

test('checking a task off moves it to Completed and undo brings it back', async ({ app: page }) => {
  await addTask(page, 'Send invoice');
  await page.getByTestId('task-checkbox').click();
  await expect(page.getByText('Task moved to Completed')).toBeVisible();
  await page.getByText('Undo', { exact: true }).click();
  await expect(page.getByText('Task moved to Completed')).toBeHidden();

  await page.getByTestId('task-checkbox').click();
  await openCompleted(page);
  await expect(page.getByText('1 task', { exact: true })).toBeVisible();
});

test('a completed task can be restored', async ({ app: page }) => {
  await addTask(page, 'Water plants');
  await page.getByTestId('task-checkbox').click();
  await openCompleted(page);
  await swipeRowLeft(page, 'Water plants');
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('Nothing completed yet')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expectTask(page, 'Water plants');
  await expect(page.getByTestId('task-checkbox')).toBeVisible();
});

test('a completed task can be deleted from Completed', async ({ app: page }) => {
  await addTask(page, 'Old receipt');
  await page.getByTestId('task-checkbox').click();
  await openCompleted(page);
  await swipeRowLeft(page, 'Old receipt');
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Nothing completed yet')).toBeVisible();
});

test('completed tasks can be cleared', async ({ app: page }) => {
  await addTask(page, 'Take out trash');
  await page.getByTestId('task-checkbox').click();
  await openCompleted(page);
  await page.getByText('Clear', { exact: true }).click();
  await page.getByText(/^Delete \(1\)$/).click();
  await expect(page.getByText('Nothing completed yet')).toBeVisible();
});
