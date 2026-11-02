import { expect, test } from './fixtures';

test('first launch shows the intro slides and then the task screen', async ({ fresh: page }) => {
  await expect(page.getByText('Focus on what matters')).toBeVisible();
  await page.getByText('Next', { exact: true }).click();
  // The slides scroll with an animation; wait for it before pressing Next again.
  await expect(page.getByText('Write like you think')).toBeInViewport({ ratio: 1 });
  await page.getByText('Next', { exact: true }).click();
  await expect(page.getByText('We’ll nudge you in time')).toBeInViewport({ ratio: 1 });
  await page.getByText('Get started', { exact: true }).click();
  await expect(page.getByTestId('add-task')).toBeVisible();
});

test('skipping the intro opens the task screen and is remembered', async ({ fresh: page }) => {
  await page.getByText('Skip', { exact: true }).click();
  await expect(page.getByTestId('add-task')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('add-task')).toBeVisible();
  await expect(page.getByText('Skip', { exact: true })).toBeHidden();
});
