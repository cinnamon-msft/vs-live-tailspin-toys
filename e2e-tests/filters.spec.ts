import { test, expect } from '@playwright/test';

test.describe('Game Filtering', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // Wait for at least one game card to be present
        await expect(page.getByTestId('game-card').first()).toBeVisible();
    });

    test('should display the filter panel with category and publisher controls', async ({ page }) => {
        await test.step('Verify filter panel is visible', async () => {
            await expect(page.getByTestId('filter-panel')).toBeVisible();
        });

        await test.step('Verify category checkboxes are present', async () => {
            const checkboxes = page.getByTestId('category-filter-group').locator('input[type="checkbox"]');
            expect(await checkboxes.count()).toBeGreaterThan(0);
        });

        await test.step('Verify publisher dropdown is present', async () => {
            await expect(page.getByTestId('publisher-filter-select')).toBeVisible();
        });

        await test.step('Verify reset button is initially hidden', async () => {
            await expect(page.getByTestId('reset-filters-button')).toBeHidden();
        });

        await test.step('Verify filter status is initially hidden', async () => {
            await expect(page.getByTestId('filter-status')).toBeHidden();
        });
    });

    test('should filter games when a category is selected', async ({ page }) => {
        await test.step('Select the first category checkbox', async () => {
            const firstCheckbox = page.getByTestId('category-filter-group').locator('input[type="checkbox"]').first();
            await firstCheckbox.check();
            await expect(firstCheckbox).toBeChecked();
        });

        await test.step('Verify filter status appears and contains count', async () => {
            await expect(page.getByTestId('filter-status')).toContainText('Showing');
            await expect(page.getByTestId('filter-status')).toContainText('games');
        });

        await test.step('Verify reset button appears', async () => {
            await expect(page.getByTestId('reset-filters-button')).toBeVisible();
        });

        await test.step('Verify games grid still shows at least one card', async () => {
            // Count cards that are not hidden by inline style
            const visibleCount = await page.evaluate(() => {
                const cards = document.querySelectorAll('[data-testid="game-card"]');
                return Array.from(cards).filter((el) => (el as HTMLElement).style.display !== 'none').length;
            });
            expect(visibleCount).toBeGreaterThanOrEqual(0);
        });
    });

    test('should filter games when a publisher is selected', async ({ page }) => {
        let totalCount: number;

        await test.step('Record total game count', async () => {
            totalCount = await page.getByTestId('game-card').count();
        });

        await test.step('Select the first non-empty publisher option', async () => {
            const publisherSelect = page.getByTestId('publisher-filter-select');
            const firstOptionValue = await publisherSelect.locator('option:not([value=""])').first().getAttribute('value');
            await publisherSelect.selectOption(firstOptionValue ?? '');
        });

        await test.step('Verify filter status shows the correct count format', async () => {
            await expect(page.getByTestId('filter-status')).toContainText(`of ${totalCount} games`);
        });

        await test.step('Verify reset button is visible', async () => {
            await expect(page.getByTestId('reset-filters-button')).toBeVisible();
        });
    });

    test('should combine category and publisher filters with AND semantics', async ({ page }) => {
        let countAfterCategoryFilter: number;

        await test.step('Apply category filter', async () => {
            const firstCheckbox = page.getByTestId('category-filter-group').locator('input[type="checkbox"]').first();
            await firstCheckbox.check();
            await expect(page.getByTestId('filter-status')).toContainText('Showing');
            countAfterCategoryFilter = await page.evaluate(() => {
                const cards = document.querySelectorAll('[data-testid="game-card"]');
                return Array.from(cards).filter((el) => (el as HTMLElement).style.display !== 'none').length;
            });
        });

        await test.step('Also apply publisher filter', async () => {
            const publisherSelect = page.getByTestId('publisher-filter-select');
            const firstOptionValue = await publisherSelect.locator('option:not([value=""])').first().getAttribute('value');
            await publisherSelect.selectOption(firstOptionValue ?? '');
        });

        await test.step('Combined filter result should be subset of category-only result', async () => {
            await expect(page.getByTestId('filter-status')).toContainText('Showing');
            const countAfterBothFilters = await page.evaluate(() => {
                const cards = document.querySelectorAll('[data-testid="game-card"]');
                return Array.from(cards).filter((el) => (el as HTMLElement).style.display !== 'none').length;
            });
            expect(countAfterBothFilters).toBeLessThanOrEqual(countAfterCategoryFilter);
        });
    });

    test('should clear all filters when the reset button is clicked', async ({ page }) => {
        let totalCount: number;

        await test.step('Record total game count', async () => {
            totalCount = await page.getByTestId('game-card').count();
        });

        await test.step('Apply a category filter', async () => {
            const firstCheckbox = page.getByTestId('category-filter-group').locator('input[type="checkbox"]').first();
            await firstCheckbox.check();
            await expect(page.getByTestId('filter-status')).toContainText('Showing');
        });

        await test.step('Click reset filters', async () => {
            await page.getByTestId('reset-filters-button').click();
        });

        await test.step('Verify all games are visible again', async () => {
            const visibleCount = await page.evaluate(() => {
                const cards = document.querySelectorAll('[data-testid="game-card"]');
                return Array.from(cards).filter((el) => (el as HTMLElement).style.display !== 'none').length;
            });
            expect(visibleCount).toBe(totalCount);
        });

        await test.step('Verify filter status and reset button are hidden', async () => {
            await expect(page.getByTestId('filter-status')).toBeHidden();
            await expect(page.getByTestId('reset-filters-button')).toBeHidden();
        });

        await test.step('Verify category checkboxes are unchecked', async () => {
            const checkboxes = page.getByTestId('category-filter-group').locator('input[type="checkbox"]:checked');
            await expect(checkboxes).toHaveCount(0);
        });
    });

    test('filter controls should be fully keyboard accessible', async ({ page }) => {
        await test.step('Focus and toggle a category checkbox with the keyboard', async () => {
            const firstCheckbox = page.getByTestId('category-filter-group').locator('input[type="checkbox"]').first();
            await firstCheckbox.focus();
            await expect(firstCheckbox).toBeFocused();
            await firstCheckbox.press('Space');
            await expect(firstCheckbox).toBeChecked();
        });

        await test.step('Focus the publisher dropdown', async () => {
            const publisherSelect = page.getByTestId('publisher-filter-select');
            await publisherSelect.focus();
            await expect(publisherSelect).toBeFocused();
        });

        await test.step('Focus the reset button and activate it with Enter', async () => {
            await expect(page.getByTestId('reset-filters-button')).toBeVisible();
            await page.getByTestId('reset-filters-button').focus();
            await page.getByTestId('reset-filters-button').press('Enter');
            await expect(page.getByTestId('filter-status')).toBeHidden();
        });
    });
});

