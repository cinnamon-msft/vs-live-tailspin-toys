import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getGameById,
    getFilteredGames,
    getAllCategories,
    getAllPublishers,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

/**
 * Seeds a richer fixture with two categories and two publishers so filter
 * combinations can be verified independently.
 */
async function seedMultiCategoryGames(db: Database): Promise<{
    strategyId: number;
    puzzleId: number;
    pubOneId: number;
    pubTwoId: number;
}> {
    const [stratRow] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'strat' })
        .returning({ id: categories.id });
    const [puzzleRow] = await db
        .insert(categories)
        .values({ name: 'Puzzle', description: 'puzzle' })
        .returning({ id: categories.id });
    const [pubOneRow] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub1' })
        .returning({ id: publishers.id });
    const [pubTwoRow] = await db
        .insert(publishers)
        .values({ name: 'Pub Two', description: 'pub2' })
        .returning({ id: publishers.id });

    // strategy + pubOne
    await db.insert(games).values({ title: 'Alpha', description: 'd', starRating: 4.0, categoryId: stratRow.id, publisherId: pubOneRow.id });
    // puzzle + pubOne
    await db.insert(games).values({ title: 'Beta', description: 'd', starRating: 4.0, categoryId: puzzleRow.id, publisherId: pubOneRow.id });
    // strategy + pubTwo
    await db.insert(games).values({ title: 'Gamma', description: 'd', starRating: 4.0, categoryId: stratRow.id, publisherId: pubTwoRow.id });
    // puzzle + pubTwo
    await db.insert(games).values({ title: 'Delta', description: 'd', starRating: 4.0, categoryId: puzzleRow.id, publisherId: pubTwoRow.id });

    return { strategyId: stratRow.id, puzzleId: puzzleRow.id, pubOneId: pubOneRow.id, pubTwoId: pubTwoRow.id };
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });
});

describe('getFilteredGames', () => {
    let db: Database;

    beforeEach(async () => {
        db = createTestDatabase();
    });

    it('returns all games when no filters are supplied', async () => {
        const { strategyId, puzzleId } = await seedMultiCategoryGames(db);
        void strategyId; void puzzleId;
        const result = await getFilteredGames(db, {});
        expect(result.map((g) => g.title)).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma']);
    });

    it('filters by a single category', async () => {
        const { strategyId } = await seedMultiCategoryGames(db);
        const result = await getFilteredGames(db, { categoryIds: [strategyId] });
        expect(result.map((g) => g.title)).toEqual(['Alpha', 'Gamma']);
        expect(result.every((g) => g.category?.name === 'Strategy')).toBe(true);
    });

    it('filters by multiple categories (OR within category set)', async () => {
        const { strategyId, puzzleId } = await seedMultiCategoryGames(db);
        const result = await getFilteredGames(db, { categoryIds: [strategyId, puzzleId] });
        expect(result).toHaveLength(4);
    });

    it('filters by publisher', async () => {
        const { pubOneId } = await seedMultiCategoryGames(db);
        const result = await getFilteredGames(db, { publisherId: pubOneId });
        expect(result.map((g) => g.title)).toEqual(['Alpha', 'Beta']);
        expect(result.every((g) => g.publisher?.name === 'Pub One')).toBe(true);
    });

    it('combines category and publisher filters (AND semantics)', async () => {
        const { strategyId, pubOneId } = await seedMultiCategoryGames(db);
        const result = await getFilteredGames(db, { categoryIds: [strategyId], publisherId: pubOneId });
        expect(result.map((g) => g.title)).toEqual(['Alpha']);
    });

    it('returns empty array when no games match', async () => {
        const { strategyId, pubTwoId } = await seedMultiCategoryGames(db);
        // Puzzle + PubTwo matches Delta only; if we ask for Strategy + PubTwo we get Gamma only.
        // Filtering for a non-existent combo: ask for strategyId but pubTwoId only has Gamma which IS strategy+pubTwo.
        // Use a fake publisherId that doesn't exist to get empty result.
        const result = await getFilteredGames(db, { categoryIds: [strategyId], publisherId: pubTwoId + 999 });
        void pubTwoId;
        expect(result).toHaveLength(0);
    });

    it('treats an empty categoryIds array as no category filter', async () => {
        const { pubOneId } = await seedMultiCategoryGames(db);
        const result = await getFilteredGames(db, { categoryIds: [], publisherId: pubOneId });
        expect(result.map((g) => g.title)).toEqual(['Alpha', 'Beta']);
    });

    it('returns results ordered by title', async () => {
        await seedMultiCategoryGames(db);
        const result = await getFilteredGames(db, {});
        const titles = result.map((g) => g.title);
        expect(titles).toEqual([...titles].sort());
    });
});

describe('getAllCategories', () => {
    let db: Database;

    beforeEach(async () => {
        db = createTestDatabase();
    });

    it('returns all categories ordered by name', async () => {
        await db.insert(categories).values([
            { name: 'Trivia', description: 't' },
            { name: 'Action', description: 'a' },
        ]);
        const result = await getAllCategories(db);
        expect(result.map((c) => c.name)).toEqual(['Action', 'Trivia']);
    });

    it('returns empty array when no categories exist', async () => {
        const result = await getAllCategories(db);
        expect(result).toHaveLength(0);
    });
});

describe('getAllPublishers', () => {
    let db: Database;

    beforeEach(async () => {
        db = createTestDatabase();
    });

    it('returns all publishers ordered by name', async () => {
        await db.insert(publishers).values([
            { name: 'Zephyr Games', description: 'z' },
            { name: 'Apex Studios', description: 'a' },
        ]);
        const result = await getAllPublishers(db);
        expect(result.map((p) => p.name)).toEqual(['Apex Studios', 'Zephyr Games']);
    });

    it('returns empty array when no publishers exist', async () => {
        const result = await getAllPublishers(db);
        expect(result).toHaveLength(0);
    });
});

