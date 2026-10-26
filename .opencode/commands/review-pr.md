---
description: Independently review a GitHub PR at its exact head and post a neutral review. Optional second argument is a unique detached-worktree path.
agent: pr-reviewer
---

Review PR #$1. Optional second argument: `$2` is the exact review-worktree path
to use. Read `docs/EXTERNAL_REVIEW.md` and follow the pr-reviewer instructions.
Get live metadata, review the actual base-to-head diff in your own detached
worktree, post one neutral GitHub review, and remove only your own worktree.
The owner chooses the model in a fresh session; never review your own work.
