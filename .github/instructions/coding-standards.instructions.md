---
description: 'Comment philosophy, TSDoc standards, and TypeScript code quality conventions'
applyTo: '**/*.{ts,astro}'
---

# Coding Standards

This file defines the commenting and documentation conventions for Tailspin Toys. Follow these rules across all TypeScript and Astro files.

## Comment Philosophy

**Comment intent, not mechanics.** Write comments that explain *why* code exists or the reasoning behind a non-obvious decision — not *what* the code does. Code already says what it does; comments should add the reasoning that code cannot express on its own.

### ✅ Do: comment why and non-obvious decisions

```ts
// Deterministic hash instead of Math.random keeps static builds reproducible across runs.
const tenths = hash % 21;
```

```ts
// Skip CRLF's paired \n so we don't emit a blank field.
if (char === '\r' && content[i + 1] === '\n') {
    i++;
}
```

### ❌ Don't: restate what the code already says

```ts
// Increment i
i++;

// Return null if rows is empty
return rows.length > 0 ? mapGame(rows[0]) : null;
```

Avoid comments that are just a prose translation of the next line. If the intent is truly clear from the code, no comment is better than a redundant one.

### Keep comments current

Treat an outdated comment as a bug. Update or delete a comment **in the same change** that touches the related code. A stale comment actively misleads the reader and is worse than no comment at all.

## TSDoc / JSDoc for the Data Layer

Every **exported** function in `db/` and `src/lib/` **must** have a TSDoc comment. At minimum, describe what the function does in a single line. Add `@param` tags when a parameter's purpose is not obvious from its name and type, and `@returns` when the return value is not obvious from the return type alone.

### Full TSDoc example

```ts
/**
 * Deterministically derive a star rating in [3.0, 5.0] from the game title.
 * Uses a stable hash so static builds produce identical output across runs.
 *
 * @param title - The game title used as the hash input.
 * @returns A number in [3.0, 5.0] rounded to one decimal place.
 */
export function ratingFromTitle(title: string): number { ... }
```

```ts
/**
 * Fetch a single game by primary key, joining category and publisher.
 *
 * @param db - Injectable Drizzle client (real or in-memory test instance).
 * @param id - The game's primary key.
 * @returns The matching game, or `null` when no row exists.
 */
export async function getGameById(db: Database, id: number): Promise<Game | null> { ... }
```

### Short single-line TSDoc

Simple, unambiguous helpers may use a condensed single-line comment:

```ts
/** All games ordered by title. */
export async function getAllGames(db: Database): Promise<Game[]> { ... }
```

> [!NOTE]
> The injectable `db` argument enables the testing pattern where pages pass the real Drizzle client and tests pass an in-memory instance. Always mention it in TSDoc so the pattern remains visible from the function signature.

## Astro Component `Props` Documentation

Every reusable `.astro` component **must** document its `Props` interface so the component API is self-explanatory. Add a short description above the interface, and a comment on each prop whose purpose is not obvious from its name and type:

```astro
---
/**
 * Card displaying a crowdfunding game with its category, publisher, and star rating.
 */
interface Props {
  /** The game to display. */
  game: Game;
  /** When true, renders the card in a compact single-line layout. */
  compact?: boolean;
}
---
```

Page-level `Props` (layouts and pages that accept a title or similar pass-through) may use a shorter comment or a single-line `/** … */` above the interface when the fields are self-evident.

## Explicit TypeScript Types

Exported functions in `db/` and `src/lib/` **must** declare explicit parameter types and return types. TypeScript inference is convenient inside implementations, but leaving the public contract implicit makes helpers harder to call, test, and reason about without reading the body.

This convention is enforced by ESLint (`@typescript-eslint/explicit-module-boundary-types`) for those files.

```ts
// ✅ Correct — explicit return type
export function categoryDescription(name: string): string {
  return `Collection of ${name} games available for crowdfunding`;
}

// ❌ Missing return type — ESLint will error
export function categoryDescription(name: string) {
  return `Collection of ${name} games available for crowdfunding`;
}
```

For all other TypeScript files, follow the broader project rule of using explicit types for function parameters and return values — especially in test helpers and shared utilities.
