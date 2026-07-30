import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";

const DEFAULT_REPO = "cinnamon-msft/vs-live-tailspin-toys";
const DEFAULT_LIMIT = 20;
const servers = new Map();

let session;

function execGh(args) {
    return new Promise((resolve, reject) => {
        execFile("gh", args, { maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr?.trim() || error.message));
                return;
            }
            resolve(stdout);
        });
    });
}

async function resolveRepoName(preferredRepo) {
    if (preferredRepo && typeof preferredRepo === "string") {
        return preferredRepo;
    }
    if (process.env.GITHUB_REPOSITORY) {
        return process.env.GITHUB_REPOSITORY;
    }
    try {
        const output = await execGh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
        const repo = output.trim();
        return repo || DEFAULT_REPO;
    } catch {
        return DEFAULT_REPO;
    }
}

async function fetchIssues(repo, limit) {
    const output = await execGh([
        "issue",
        "list",
        "--repo",
        repo,
        "--state",
        "open",
        "--limit",
        String(limit),
        "--json",
        "number,title,body,labels,updatedAt,createdAt,comments,assignees,url",
    ]);
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed : [];
}

function clipText(value, maxLength = 260) {
    const normalized = String(value || "")
        .replace(/\s+/g, " ")
        .trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, maxLength - 1)}…`;
}

function buildIssueDescription(issue) {
    const paragraph = String(issue.body || "")
        .split(/\r?\n\r?\n/)
        .map((part) => part.trim())
        .find((part) => part.length > 0);
    return clipText(paragraph || "No description provided.");
}

function calculateIssuePriority(issue, nowMs) {
    const titleAndBody = `${issue.title || ""} ${issue.body || ""}`.toLowerCase();
    const labels = (issue.labels || []).map((label) => String(label.name || "").toLowerCase());
    const updatedMs = Date.parse(issue.updatedAt || issue.createdAt || "");
    const hoursSinceUpdate = Number.isFinite(updatedMs) ? (nowMs - updatedMs) / (1000 * 60 * 60) : 9999;

    let score = 0;
    const reasons = [];

    if (hoursSinceUpdate <= 24) {
        score += 30;
        reasons.push("Recently updated in the last 24 hours");
    } else if (hoursSinceUpdate <= 72) {
        score += 20;
        reasons.push("Updated recently, so active context is still fresh");
    } else {
        score += 8;
        reasons.push("Still open and pending attention");
    }

    const impactKeywords = [
        "performance",
        "search",
        "sort",
        "pagination",
        "filter",
        "accessibility",
        "error",
        "bug",
        "broken",
        "security",
    ];
    const matchingImpact = impactKeywords.filter((keyword) => titleAndBody.includes(keyword));
    if (matchingImpact.length > 0) {
        score += 18;
        reasons.push(`High user-impact area (${matchingImpact.slice(0, 3).join(", ")})`);
    }

    if ((issue.comments || []).length > 0) {
        score += 10;
        reasons.push("Has discussion activity to resolve");
    }

    if ((issue.assignees || []).length === 0) {
        score += 6;
        reasons.push("Unassigned, so it may currently be waiting for an owner");
    }

    if (labels.some((name) => name.includes("urgent") || name.includes("critical") || name.includes("high"))) {
        score += 24;
        reasons.push("Marked with a high-priority label");
    }

    if (String(issue.body || "").includes("## Acceptance criteria")) {
        score += 6;
        reasons.push("Clear acceptance criteria means it is implementation-ready");
    }

    return {
        score,
        description: buildIssueDescription(issue),
        justification: reasons.slice(0, 3).join("; "),
    };
}

function rankIssues(issues) {
    const nowMs = Date.now();
    const scored = issues.map((issue) => {
        const priority = calculateIssuePriority(issue, nowMs);
        return {
            ...issue,
            description: priority.description,
            justification: priority.justification,
            score: priority.score,
        };
    });

    scored.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        return b.number - a.number;
    });

    return {
        top: scored.slice(0, 3),
        backlog: scored.slice(3),
        all: scored,
    };
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function renderIssueCard(issue, emphasize) {
    const border = emphasize ? "var(--color-accent-emphasis, #1f6feb)" : "var(--border-color-default, #d0d7de)";
    const bg = emphasize ? "var(--true-color-blue-muted, rgba(56, 139, 253, 0.12))" : "var(--background-color-default, #fff)";
    const buttonLabel = `Add issue #${issue.number} to current context`;

    return `<article class="card" style="border-left-color:${border};background:${bg}">
        <div class="card-head">
            <h3><a href="${escapeHtml(issue.url)}" target="_blank" rel="noopener noreferrer">#${issue.number} ${escapeHtml(issue.title)}</a></h3>
            <span class="score">Score ${issue.score}</span>
        </div>
        <p class="description">${escapeHtml(issue.description)}</p>
        <p class="justification"><strong>Why this is prioritized:</strong> ${escapeHtml(issue.justification)}</p>
        <button type="button" class="context-btn" data-issue-number="${issue.number}" aria-label="${escapeHtml(buttonLabel)}">${escapeHtml(buttonLabel)}</button>
    </article>`;
}

function renderHtml(instanceId, repo, board) {
    const topHtml = board.top.length > 0
        ? board.top.map((issue) => renderIssueCard(issue, true)).join("\n")
        : "<p class=\"empty\">No open issues found.</p>";
    const backlogHtml = board.backlog.length > 0
        ? board.backlog.map((issue) => renderIssueCard(issue, false)).join("\n")
        : "<p class=\"empty\">No remaining issues.</p>";

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Issue triage board</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      padding: 16px;
      background: var(--background-color-default, #ffffff);
      color: var(--text-color-default, #1f2328);
      font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      font-size: var(--text-body-medium, 14px);
      line-height: var(--leading-body-medium, 20px);
    }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    h1 { margin: 0; font-size: var(--text-title-large, 24px); line-height: var(--leading-title-large, 30px); }
    .subtitle { color: var(--text-color-muted, #59636e); margin: 4px 0 0; }
    button {
      border: 1px solid var(--border-color-default, #d0d7de);
      background: var(--background-color-default, #fff);
      color: var(--text-color-default, #1f2328);
      border-radius: 8px;
      padding: 8px 12px;
      cursor: pointer;
      font: inherit;
    }
    button:hover { filter: brightness(0.95); }
    button:focus { outline: 2px solid var(--color-focus-outline, #0969da); outline-offset: 2px; }
    .section { margin-top: 16px; }
    .section h2 { margin: 0 0 8px; font-size: 18px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
    .card {
      border: 1px solid var(--border-color-default, #d0d7de);
      border-left-width: 5px;
      border-radius: 12px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .card h3 { margin: 0; font-size: 15px; line-height: 20px; }
    .card a { color: inherit; text-decoration: none; }
    .card a:hover { text-decoration: underline; }
    .score { color: var(--text-color-muted, #59636e); font-size: 12px; white-space: nowrap; }
    .description, .justification { margin: 0; }
    .justification { color: var(--text-color-muted, #59636e); }
    .context-btn { align-self: flex-start; margin-top: auto; }
    .status { margin-top: 12px; min-height: 20px; color: var(--text-color-muted, #59636e); }
    .status.error { color: var(--true-color-red, #d1242f); }
    .empty { color: var(--text-color-muted, #59636e); }
  </style>
</head>
<body>
  <header class="header">
    <div>
      <h1>Issue triage board</h1>
      <p class="subtitle">Session instance: <code>${escapeHtml(instanceId)}</code> · Repo: <code>${escapeHtml(repo)}</code></p>
    </div>
    <button type="button" id="refresh-board">Refresh ranking</button>
  </header>

  <section class="section" aria-label="Top priorities">
    <h2>Needs attention now (Top 3)</h2>
    <div class="cards">
      ${topHtml}
    </div>
  </section>

  <section class="section" aria-label="Remaining issues">
    <h2>Everything else</h2>
    <div class="cards">
      ${backlogHtml}
    </div>
  </section>

  <p id="status" class="status" role="status" aria-live="polite"></p>

  <script>
    const statusEl = document.getElementById("status");
    const refreshBtn = document.getElementById("refresh-board");

    async function postJson(path, payload) {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }
      return data;
    }

    async function addIssueToContext(issueNumber) {
      statusEl.classList.remove("error");
      statusEl.textContent = "Adding issue #" + issueNumber + " to current context...";
      try {
        await postJson("/api/add-context", { issueNumber });
        statusEl.textContent = "Issue #" + issueNumber + " was added to the current session context.";
      } catch (error) {
        statusEl.classList.add("error");
        statusEl.textContent = "Could not add issue #" + issueNumber + ": " + (error.message || "Unknown error");
      }
    }

    document.querySelectorAll(".context-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const issueNumber = Number(button.getAttribute("data-issue-number"));
        if (Number.isFinite(issueNumber)) {
          void addIssueToContext(issueNumber);
        }
      });
    });

    refreshBtn.addEventListener("click", () => {
      statusEl.classList.remove("error");
      statusEl.textContent = "Refreshing board...";
      window.location.reload();
    });
  </script>
</body>
</html>`;
}

async function readRequestJson(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf-8").trim();
    return raw ? JSON.parse(raw) : {};
}

async function buildBoard(repo, limit) {
    const issues = await fetchIssues(repo, limit);
    return rankIssues(issues);
}

async function sendIssueToSession(repo, issue) {
    const prompt = [
        `Please add GitHub issue #${issue.number} to the active context and prioritize it next.`,
        `Repository: ${repo}`,
        `Issue URL: ${issue.url}`,
        `Title: ${issue.title}`,
        `Description: ${issue.description}`,
        `Why prioritized now: ${issue.justification}`,
        "",
        "Confirm that this issue is now the immediate focus and then continue with implementation planning.",
    ].join("\n");

    await session.send({ prompt });
}

async function startServer(instanceId, repo, limit) {
    const state = {
        repo,
        limit,
        board: { top: [], backlog: [], all: [] },
    };

    const server = createServer(async (req, res) => {
        try {
            const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
            if (req.method === "GET" && requestUrl.pathname === "/") {
                state.board = await buildBoard(state.repo, state.limit);
                res.statusCode = 200;
                res.setHeader("Content-Type", "text/html; charset=utf-8");
                res.end(renderHtml(instanceId, state.repo, state.board));
                return;
            }

            if (req.method === "POST" && requestUrl.pathname === "/api/add-context") {
                const body = await readRequestJson(req);
                const issueNumber = Number(body.issueNumber);
                if (!Number.isInteger(issueNumber)) {
                    res.statusCode = 400;
                    res.setHeader("Content-Type", "application/json; charset=utf-8");
                    res.end(JSON.stringify({ error: "issueNumber must be an integer." }));
                    return;
                }

                if (state.board.all.length === 0) {
                    state.board = await buildBoard(state.repo, state.limit);
                }
                const issue = state.board.all.find((entry) => entry.number === issueNumber);
                if (!issue) {
                    res.statusCode = 404;
                    res.setHeader("Content-Type", "application/json; charset=utf-8");
                    res.end(JSON.stringify({ error: `Issue #${issueNumber} was not found in the board.` }));
                    return;
                }

                await sendIssueToSession(state.repo, issue);
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify({ ok: true }));
                return;
            }

            res.statusCode = 404;
            res.end("Not found");
        } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }));
        }
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/`, state };
}

session = await joinSession({
    canvases: [
        createCanvas({
            id: "triage-kanban",
            displayName: "Issue Triage Board",
            description:
                "Two-section issue triage board that highlights the top three issues with justifications and add-to-context actions.",
            inputSchema: {
                type: "object",
                properties: {
                    repo: { type: "string", description: "Repo in owner/name format." },
                    limit: { type: "integer", minimum: 3, maximum: 100 },
                },
                additionalProperties: false,
            },
            actions: [
                {
                    name: "refresh_board",
                    description: "Refreshes and returns the latest ranked issue list.",
                    handler: async (ctx) => {
                        const entry = servers.get(ctx.instanceId);
                        if (!entry) {
                            throw new CanvasError("canvas_not_open", "Canvas instance is not open.");
                        }
                        entry.state.board = await buildBoard(entry.state.repo, entry.state.limit);
                        return {
                            repo: entry.state.repo,
                            top: entry.state.board.top,
                            remainingCount: entry.state.board.backlog.length,
                        };
                    },
                },
                {
                    name: "add_issue_to_context",
                    description: "Adds a specific issue from the board into the active session context.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            issueNumber: { type: "integer", minimum: 1 },
                        },
                        required: ["issueNumber"],
                        additionalProperties: false,
                    },
                    handler: async (ctx) => {
                        const entry = servers.get(ctx.instanceId);
                        if (!entry) {
                            throw new CanvasError("canvas_not_open", "Canvas instance is not open.");
                        }
                        if (entry.state.board.all.length === 0) {
                            entry.state.board = await buildBoard(entry.state.repo, entry.state.limit);
                        }
                        const issue = entry.state.board.all.find((candidate) => candidate.number === Number(ctx.input.issueNumber));
                        if (!issue) {
                            throw new CanvasError("issue_not_found", `Issue #${ctx.input.issueNumber} is not present in the board.`);
                        }
                        await sendIssueToSession(entry.state.repo, issue);
                        return { ok: true, issueNumber: issue.number };
                    },
                },
            ],
            open: async (ctx) => {
                const repo = await resolveRepoName(ctx.input?.repo);
                const limit = Number.isInteger(ctx.input?.limit) ? ctx.input.limit : DEFAULT_LIMIT;

                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = await startServer(ctx.instanceId, repo, limit);
                    servers.set(ctx.instanceId, entry);
                } else {
                    entry.state.repo = repo;
                    entry.state.limit = limit;
                    entry.state.board = await buildBoard(repo, limit);
                }

                return {
                    title: "Issue triage board",
                    status: "Top 3 prioritized issues",
                    url: entry.url,
                };
            },
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (!entry) {
                    return;
                }
                servers.delete(ctx.instanceId);
                await new Promise((resolve) => entry.server.close(() => resolve()));
            },
        }),
    ],
});
