# Independent PR review

The implementer prepares a PR and its review contract. A fresh session of a
**different model family** reviews its exact head in a detached worktree and
posts one neutral GitHub review. The owner chooses the reviewer and decides
what to merge. The initial game was implemented by OpenAI GPT/Codex, so use a
non-OpenAI reviewer for its independent review. No model is hardcoded here.

## Run a review

In this checkout, start a fresh OpenCode session, select the owner's chosen
model with `/models`, then run `/review-pr <PR number> "<unique worktree path>"`.
The implementing-side handoff supplies actual arguments. The reviewer follows
`.opencode/agents/pr-reviewer.md`; the command is
`.opencode/commands/review-pr.md`. For another tool, use the standalone prompt
in the PR body and read the same agent instructions. Setup does not start a
review automatically.

The reviewer creates and verifies its own worktree, reads the real PR diff
and relevant context, checks the stated contract, and posts with
`gh pr review <number> --comment --body-file <temporary UTF-8 file>`.
It does not edit code, commit, push, approve, request changes or merge.
Findings include severity, file/line and evidence. A completed clean review
explicitly says no findings; an incomplete pass says what remains unchecked.
The full reviewed SHAs, checks run and actual model identity are mandatory.
The reviewer rechecks live SHAs before posting and removes only its own
worktree. Posting or cleanup failures must be reported without discarding work.

## Initial whole-project PR

All game development through v0.6.0 was already on main before review adoption.
A normal PR against main would hide that code. `review/empty-baseline` therefore
contains an empty root commit, and `review/whole-project` joins that baseline
with the existing project history. Its tree contains the complete project plus
this workflow. The base-to-head diff adds every tracked file, including the
first prototype. Existing main history is preserved; no force push is needed.

This is a **review-only PR**, not a normal integration PR. Keep it open for
findings; merging it into the empty baseline does not update main. Future
ordinary work uses task branches and PRs against main. The review branch also
contains a separate adoption commit so the workflow can be integrated into main
without introducing the artificial comparison baseline.

See `docs/whole-project-review.md` for the review contract, areas and limits.
Review generated JSON as part of the data pipeline; do not mistake a large
machine-generated diff for permission to omit geometry correctness checks.

## Provenance and adaptations

Adapted on 2026-10-26 from Geoclick2027 at
`d296ac3ef731f04776cb1877934a0bb78347e523`:

- `.claude/skills/review-pr/SKILL.md`
- `.opencode/commands/review-pr.md`
- `.opencode/agents/pr-reviewer.md`

Kept fresh-session independence, exact-head detached worktrees, evidence-backed
neutral GitHub reviews, stale-head checks and owned-worktree cleanup. Adapted
project rules and checks for this WSL/Windows game. Verified the local OpenCode version (2.1.4) and used its ordered
`permissions:` list with `shell` / `subagent` actions. See the official
[agent configuration](https://opencode.ai/v2/docs/agents/) and
[permission reference](https://opencode.ai/v2/docs/permissions/). Dropped Geoclick's PowerShell runner and historical model chains: those
are project-specific and must not silently choose this project's reviewer.
The old harness-bootstrap default clone (`~/projects/harness_template`) is
absent here; no full harness adoption is claimed or required for this workflow.
