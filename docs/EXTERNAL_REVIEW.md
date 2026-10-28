# Review process history

**Current process:** reviews are optional and run by the owner by hand. See `AGENTS.md` ("Changes
and reviews"), [`review-pr.md`](review-pr.md) for one PR and [`milestone-review.md`](milestone-review.md)
for a release. The owner decides which model reviews; no different-family rule, fresh-session rule
or re-review loop is required. Adopted 2026-10-28, following malpaco's model ("we work with releases
now"), after the owner dropped automatic per-task review from most repositories.

## 2026-10-26 to 2026-10-28: mandatory independent PR review

Adapted on 2026-10-26 from Geoclick2027 at `d296ac3ef731f04776cb1877934a0bb78347e523`: every PR was
reviewed at its exact head by a fresh session of a different model family, in a detached worktree,
with a fresh re-review after substantive fixes. PRs up to #18 were reviewed this way (their review
records are on GitHub); #20 to #22 received reviews and re-reviews started automatically by the
implementing session, which the owner did not want and which led to the change above.

The exact-head detached worktree, the evidence rules (full SHAs, checks run, actual model identity,
stale-head checks) and owned-worktree cleanup are kept in `.opencode/agents/pr-reviewer.md` and
[`review-pr.md`](review-pr.md). OpenCode 2.1.4's ordered `permissions:` list with `shell` /
`subagent` actions is still used; see the [agent configuration](https://opencode.ai/v2/docs/agents/)
and [permission reference](https://opencode.ai/v2/docs/permissions/).

## Initial whole-project PR

All game development through v0.6.0 was on main before review adoption, so a normal PR against main
would have hidden that code. `review/empty-baseline` contains an empty root commit and
`review/whole-project` joined it with the project history, so the base-to-head diff added every
tracked file. That PR (#1) was a review-only vehicle and is closed; its fixes reached main through
#2. See [`whole-project-review.md`](whole-project-review.md) for its contract and limits.
