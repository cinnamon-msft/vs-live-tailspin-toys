# Tailspin Toys

Tailspin Toys is a crowdfunding platform for games with a developer theme. The project is a website for a fictional game crowd-funding company, built as a single [Astro](https://astro.build/) site (fully prerendered/static output) styled with [Tailwind CSS](https://tailwindcss.com/). Its data lives in a local SQLite database accessed through [Drizzle ORM](https://orm.drizzle.team/) over [libSQL](https://github.com/tursodatabase/libsql); pages query the database directly in frontmatter at build time, so there is no separate backend service.

## Architecture

- **Astro 7** — pages, layouts, components, and routing. `output: 'static'`, so the whole site is prerendered to HTML at build time.
- **Drizzle ORM + libSQL** — the data layer. The schema lives in `db/schema.ts`; data is seeded from `db/games.csv`. Migrations are managed with `drizzle-kit`.
- **Tailwind CSS v4** — styling via utility classes (dark theme).
- **Vitest** — unit tests for the data layer and pure transforms.
- **Playwright** — end-to-end tests run against the built static site.

The database is migrated and seeded automatically before `dev`/`build` (via the `predev`/`prebuild` npm scripts) and is written to `.data/` (gitignored).

## Filtering Games

The homepage lets visitors narrow the game catalog by **category** and **publisher**:

- **Category**: Multi-select checkboxes let you filter by one or more categories at once.
- **Publisher**: A single-select dropdown filters to games from a specific publisher.
- Filters combine with AND semantics — only games matching all active filters are shown.
- A **Clear filters** button appears whenever a filter is active and resets both controls.
- A live status line ("Showing X of Y games") keeps screen-reader users informed of the current result count.

Filter controls follow the project's accessibility guidelines: semantic `<fieldset>`/`<legend>` for the checkbox group, `<label>` associations, ARIA live region for status, visible focus rings, and full keyboard support.

## Using this template

This repository is a GitHub template. When you create a new repository from it, a one-time **Bootstrap template issues** workflow (`.github/workflows/bootstrap-issues.yml`) runs automatically on the first push to `main` and opens a set of starter issues describing suggested first features. Each issue is defined by a Markdown file in `.github/bootstrap-issues/` — the first heading becomes the issue title and the remaining content becomes the body — so you can edit, add, or remove files there to control which issues are created.

The workflow only runs on repositories created from the template (the `if: ${{ !github.event.repository.is_template }}` guard skips the template itself), and after creating the issues it removes itself and the `.github/bootstrap-issues/` folder in a cleanup commit so it never runs again.

## Getting started

Install dependencies once:

```bash
npm ci
npx playwright install chromium   # only needed to run the E2E tests
```

## Launch the site

```bash
npm run dev
```

`predev` migrates and seeds the local database first. Then navigate to the [website](http://localhost:4321) to see the site!

To preview a production build instead:

```bash
npm run build      # prebuild migrates + seeds, then builds the static site
npm run preview
```

## Database

The SQLite database is built from `db/games.csv` — there is no live data to migrate.

```bash
npm run db:generate   # generate a migration after editing db/schema.ts
npm run db:migrate    # apply migrations
npm run db:seed       # seed from games.csv (idempotent)
npm run db:setup      # migrate + seed (run automatically by predev/prebuild)
```

> [!NOTE]
> Seeding is idempotent — it skips games that already exist (matched by title) rather than reconciling changed rows. CI always starts from a clean database, so it reflects `games.csv` exactly. Locally, if you edit or remove rows in `games.csv`, delete `.data/` and re-run `npm run db:setup` to fully regenerate.

## Running tests

```bash
npm run test:unit   # Vitest unit tests (transforms + data-access helpers)
npm run test:e2e    # Playwright E2E tests (builds + previews the static site first)
```

## Linting

The frontend uses ESLint to enforce code quality across TypeScript and Astro files. Run it with:

```bash
npm run lint
```

ESLint is also run automatically in CI on pull requests to `main`.

## Coding Standards

Consistent, documented code keeps the codebase readable for contributors and Copilot alike. The key conventions are captured in the instruction files under `.github/instructions/`:

| File | Covers |
|------|--------|
| [`coding-standards.instructions.md`](.github/instructions/coding-standards.instructions.md) | Comment philosophy (why, not what), TSDoc for the data layer, Props documentation for components, explicit TypeScript types |
| [`drizzle.instructions.md`](.github/instructions/drizzle.instructions.md) | Data-layer patterns, TSDoc requirements for exported helpers |
| [`astro.instructions.md`](.github/instructions/astro.instructions.md) | Component Props interface documentation |

### Highlights

- **Comment intent, not mechanics.** Explain *why* code exists, not *what* it does. Remove comments that merely paraphrase the line below them.
- **TSDoc every exported function** in `db/` and `src/lib/` — describe its purpose, parameters, and return value.
- **Document component `Props`** — every reusable `.astro` component must have a JSDoc comment on its `Props` interface.
- **Explicit types on the data layer** — exported functions in `db/` and `src/lib/` must declare explicit parameter and return types. This is enforced by ESLint (`@typescript-eslint/explicit-module-boundary-types`).

## Type checking

The project runs on **TypeScript 7** (the native Go compiler, `tsgo`) for type checking, adopted side-by-side via the [`@typescript/native-preview`](https://www.npmjs.com/package/@typescript/native-preview) package. The classic `typescript` package is intentionally kept at v6 so ESLint + `typescript-eslint` and `astro check` keep working unchanged — TypeScript 7's programmatic API isn't ready for those tools yet.

```bash
npm run typecheck        # tsgo (TS 7) type-checks the pure TypeScript (db/, src/lib/, src/types/, configs, tests)
npm run typecheck:astro  # astro sync + astro check type-check .astro files (on the classic TypeScript package)
npm run typecheck:all    # both of the above
```

`tsgo` runs against [`tsconfig.tsgo.json`](tsconfig.tsgo.json), a scoped config that excludes `.astro` files (which the native compiler doesn't understand). Type checking runs automatically in CI on pull requests to `main`.

> [!NOTE]
> The native compiler is used only for type checking (`--noEmit`); the site is still built by `astro build` (Vite/esbuild). The classic `typescript` package stays on v6 until `typescript-eslint` and `@astrojs/check` support the native API (~TS 7.1); a Dependabot `ignore` in `.github/dependabot.yml` holds the classic `typescript@7` bump until then.

## Copilot Agents & Skills

This project ships Copilot customizations to assist with quality assurance:

### PR Readiness Agent

The **PR Readiness** agent (`.github/agents/pr-readiness.md`) is a pre-PR quality gate. Invoke it before opening a pull request to:

- Verify all acceptance criteria have been implemented
- Audit test coverage and fill any gaps
- Run the full verification suite (unit tests, lint, E2E tests)
- Manually validate the feature in the browser via Playwright MCP (required for every run)
- Produce a go/no-go report

### quality-checks Skill

The **quality-checks** skill (`.github/skills/quality-checks/SKILL.md`) wraps the project's npm test and lint commands with a detailed debugging and troubleshooting runbook. Use it via `/quality-checks` when:

- Running tests or lint for the first time after setup
- Diagnosing test failures (port conflicts, stale servers, flaky tests, CI divergence)
- Validating readiness before commits, pushes, or merges

## License 

This project is licensed under the terms of the MIT open source license. Please refer to the [LICENSE](./LICENSE) for the full terms.

## Maintainers 

You can find the list of maintainers in [CODEOWNERS](./.github/CODEOWNERS).

## Support

This project is provided as-is, and may be updated over time. If you have questions, please open an issue.

## Disclaimer

This app is not intended for use in a production environment, nor is it built as an example of what a production app should look like.
