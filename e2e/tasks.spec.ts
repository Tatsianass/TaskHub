import { addTask, expect, expectNoTask, expectTask, quadrantTab, taskTitle, test } from './fixtures';

test('a new task lands in Urgent and survives a reload', async ({ app: page }) => {
  await addTask(page, 'Pay rent');
  await expectTask(page, 'Pay rent');
  await page.reload();
  await expectTask(page, 'Pay rent');
});

test('the quadrant follows importance and date', async ({ app: page }) => {
  await addTask(page, 'Read a book', { important: false, when: 'No date' });
  await expectNoTask(page, 'Read a book');
  await quadrantTab(page, 'Later').click();
  await expectTask(page, 'Read a book');

  await addTask(page, 'Plan the trip', { important: true, when: 'No date' });
  await quadrantTab(page, 'Planned').click();
  await expectTask(page, 'Plan the trip');
});

test('an empty title cannot be saved', async ({ app: page }) => {
  await page.getByTestId('add-task').click();
  await expect(page.getByText('Add task', { exact: true })).toBeVisible();
  await expect(page.locator('[aria-disabled="true"]', { hasText: 'Add task' })).toBeVisible();
});

test('editing a task changes its title', async ({ app: page }) => {
  await addTask(page, 'Call dentist');
  await taskTitle(page, 'Call dentist').click();
  await expect(page.getByText('Edit task', { exact: true })).toBeVisible();
  await page.getByPlaceholder('What needs to be done?').fill('Call the doctor');
  await page.getByText('Save', { exact: true }).click();
  await expectTask(page, 'Call the doctor');
  await expectNoTask(page, 'Call dentist');
});

test('deleting a task removes it', async ({ app: page }) => {
  await addTask(page, 'Old errand');
  await taskTitle(page, 'Old errand').click();
  await page.getByTestId('task-form-delete').click();
  await expectNoTask(page, 'Old errand');
  await page.reload();
  await expectNoTask(page, 'Old errand');
});

test('the tag filter narrows the list', async ({ app: page }) => {
  await addTask(page, 'Write report', { tag: 'Work' });
  await addTask(page, 'Wash dishes', { tag: 'Home' });
  await page.getByText(/Work$/).first().click();
  await expectTask(page, 'Write report');
  await expectNoTask(page, 'Wash dishes');
  await page.getByText('All', { exact: true }).click();
  await expectTask(page, 'Wash dishes');
});

test('a fourth task in one quadrant asks to swap or add anyway', async ({ app: page }) => {
  for (const title of ['One', 'Two', 'Three']) await addTask(page, title);
  await page.getByTestId('add-task').click();
  await page.getByPlaceholder('What needs to be done?').fill('Four');
  await expect(page.getByText('Already 3 active tasks here')).toBeVisible();
  await page.getByText('Add anyway', { exact: true }).click();
  await page.getByText('Add task', { exact: true }).click();
  await expectTask(page, 'Four');
});
