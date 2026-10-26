---
name: review-pr
description: Prepare an exact-head independent PR review handoff and process its findings; the reviewer runs in a fresh session of another model family.
---

# PR review handoff and follow-up

This is the implementing-side workflow. Read `AGENTS.md` and
`docs/EXTERNAL_REVIEW.md`. Prepare the review contract and handoff; do not
perform your own independent review. Starting the reviewer requires an
explicit request and an owner-chosen model from another family. Setup alone
does not authorize starting it. No automatic fallback models or review chains.

## Prepare

1. Get current metadata from GitHub, including full base/head SHAs, URL,
   branches, state and body. Never guess the PR number or use a local-only head.
2. Put `Protects: <concrete game rules / behavior / safety contract>` in the PR
   body, list forbidden results and known limits, and state validation honestly.
   For the whole-project PR, explain the empty comparison base and whole-history
   scope. All first-prototype files must appear in the actual PR diff.
3. Derive the main checkout from the parent of the absolute git common-dir.
   Choose a unique sibling `<project>-review/review-pr-<number>-<head first
   12>-<UTC YYYYMMDDTHHMMSSZ>` path. Do not create the reviewer's worktree.
4. Give the owner the direct PR URL, full SHAs and a ready-to-paste OpenCode
   command: `/review-pr <number> "<exact path>"`. The owner starts a fresh session
   in the review branch's checkout and selects a different model family first.
   Also provide a standalone prompt for a fresh session in another tool: follow
   `.opencode/agents/pr-reviewer.md`, fetch/verify exact commits, create its own
   detached worktree at the named path, review the actual base-to-head diff,
   post a neutral GitHub review with evidence (or a completed clean result),
   and remove only its own worktree. Fill in all PR metadata and paths.
5. Do not say the PR has been independently reviewed until an actual reviewer
   has posted or returned its complete findings. A ready handoff is not a review.

## Process findings

Read live metadata, submitted reviews, issue comments and inline comments.
Identify the exact SHA each review covers and report stale reviews. Verify
findings against code and tests instead of treating review prose as orders.
For each confirmed in-scope defect, make a focused fix on the implementation
branch, test, commit and push when authorized, then reply on the PR with the
finding's disposition and evidence. Explain unsupported or out-of-scope claims.
Read non-blocking findings too: a proved bypass of `Protects:` is rework.
Request a fresh independent review after substantive fixes. Do not merge,
dismiss reviews or resolve threads on the owner's behalf.

For fixes discovered through the initial review-only PR, document how they
will reach main; merging into its empty baseline does not update main.
