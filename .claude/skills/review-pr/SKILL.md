---
name: review-pr
description: Say whether a Cerea Vice PR deserves a review, give the owner a ready prompt to run by hand, and process one round of findings. Never starts a reviewer.
---

# PR review handoff and follow-up

This is the implementing-side workflow. Read `AGENTS.md` ("Changes and reviews") and
`docs/review-pr.md`. Reviews are optional and run by the owner by hand. Never start a reviewer or a
re-review yourself, never choose its model, and do not review your own work as if independent.

## Prepare

1. Get current metadata from GitHub: PR URL, base and head branches, full base and head SHAs, state
   and body. Never guess the PR number or use a local-only head.
2. Put `Protects: <concrete game rules, behaviour or safety contract>` in the PR body, list forbidden
   results and known limits, and state validation honestly.
3. Say whether the PR deserves a review and why (input or controls, saves, the desktop shell or its
   security boundary, map data or game rules, a release candidate). If it does not, say so; the PR
   can merge without one and the milestone review will cover it.
4. When it does, or when the owner asks, give the owner ready-to-run prompts naming the PR and its
   full head SHA, with the model left to them:
   - OpenCode: `/review-pr <number>` in a session where the owner selected the model with `/models`,
     or `opencode run -m <provider/model> --agent pr-reviewer "Review PR #<number> at <head SHA>"`.
   - Any other tool: "Read `docs/review-pr.md` and review PR #<number> at head `<head SHA>` as it
     says."
5. Do not say the PR has been reviewed until a review has been posted. A prompt is not a review.

## Process findings

One round. Read the live PR, its reviews and comments, and note the SHA each review covers; report a
review of an older head as stale. Verify every finding against the code and tests instead of treating
review prose as orders.

- A confirmed defect in what the PR delivers, or a proved bypass of `Protects:`: make a focused fix on
  the PR branch, run the relevant checks, commit and push when authorized.
- Everything else (non-blocking, out of scope, unlikely edge cases): open a follow-up issue linking the
  PR and the review.
- Reply once on the PR with each finding's disposition and evidence, including unsupported claims and
  why.

Do not request or start a re-review. If a fix is large enough to deserve one, say so and give the
owner a new prompt for the new head; they decide. Do not merge, dismiss reviews or resolve threads on
the owner's behalf.
