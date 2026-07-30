import { eq, asc, inArray, and } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database } from './db';
import { games, categories, publishers } from '../../db/schema';
import type { Game, Category, Publisher } from '../types/game';

/** Optional filters for narrowing the games list. */
export interface GameFilters {
    /** Only include games belonging to these category IDs. Empty array or omitted means no category filter. */
    categoryIds?: number[];
    /** Only include games from this publisher ID. Omitted means no publisher filter. */
    publisherId?: number;
}

const gameSelection = {
    id: games.id,
    title: games.title,
    description: games.description,
    starRating: games.starRating,
    categoryId: categories.id,
    categoryName: categories.name,
    publisherId: publishers.id,
    publisherName: publishers.name,
};

type GameSelectionRow = {
    id: number;
    title: string;
    description: string;
    starRating: number | null;
    categoryId: number | null;
    categoryName: string | null;
    publisherId: number | null;
    publisherName: string | null;
};

function mapGame(row: GameSelectionRow): Game {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        starRating: row.starRating,
        category:
            row.categoryId !== null && row.categoryName !== null
                ? { id: row.categoryId, name: row.categoryName }
                : null,
        publisher:
            row.publisherId !== null && row.publisherName !== null
                ? { id: row.publisherId, name: row.publisherName }
                : null,
    };
}

function baseGamesQuery(db: Database) {
    return db
        .select(gameSelection)
        .from(games)
        .leftJoin(categories, eq(games.categoryId, categories.id))
        .leftJoin(publishers, eq(games.publisherId, publishers.id));
}

/** All games ordered by title. */
export async function getAllGames(db: Database): Promise<Game[]> {
    const rows = await baseGamesQuery(db).orderBy(asc(games.title));
    return rows.map(mapGame);
}

/**
 * Games filtered by optional category and/or publisher, ordered by title.
 * When both filters are provided they are combined (AND semantics).
 * An empty `categoryIds` array is treated as "no category filter".
 *
 * @param db - Injectable Drizzle client (real or in-memory test instance).
 * @param filters - Optional category and publisher constraints.
 * @returns Games matching all supplied filters, ordered by title.
 */
export async function getFilteredGames(db: Database, filters: GameFilters): Promise<Game[]> {
    const conditions: SQL[] = [];

    if (filters.categoryIds && filters.categoryIds.length > 0) {
        conditions.push(inArray(games.categoryId, filters.categoryIds));
    }
    if (filters.publisherId !== undefined) {
        conditions.push(eq(games.publisherId, filters.publisherId));
    }

    const query = baseGamesQuery(db).orderBy(asc(games.title));
    const rows =
        conditions.length > 0
            ? await query.where(and(...conditions))
            : await query;

    return rows.map(mapGame);
}

/** All game ids ordered by title. */
export async function getAllGameIds(db: Database): Promise<number[]> {
    const rows = await db.select({ id: games.id }).from(games).orderBy(asc(games.title));
    return rows.map((row) => row.id);
}

/** A single game by id, or null when it does not exist. */
export async function getGameById(db: Database, id: number): Promise<Game | null> {
    const rows = await baseGamesQuery(db).where(eq(games.id, id)).limit(1);
    return rows.length > 0 ? mapGame(rows[0]) : null;
}

/** All categories ordered by name, for populating filter controls. */
export async function getAllCategories(db: Database): Promise<Category[]> {
    const rows = await db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .orderBy(asc(categories.name));
    return rows;
}

/** All publishers ordered by name, for populating filter controls. */
export async function getAllPublishers(db: Database): Promise<Publisher[]> {
    const rows = await db
        .select({ id: publishers.id, name: publishers.name })
        .from(publishers)
        .orderBy(asc(publishers.name));
    return rows;
}
