# Reviewing one PR

You review one Cerea Vice pull request. You did not write it; verify against the code, not the PR's
description. `AGENTS.md` holds the project's rules. Do not edit tracked files, commit, push, merge,
approve, request changes or label. Your final message is the review; post it once on the PR
(`gh pr review <n> --comment --body-file <file>`) and post nothing else. Adapted from malpaco's
`docs/review-pr.md`.

**Set up.** Fetch the PR head and review that exact commit in your own detached worktree
(`git worktree add --detach <path> <head SHA>`), never by switching the owner's checkout. Record the
full base and head SHAs. Install dependencies in that worktree when you need them. Remove only the
worktree you created when you finish.

Check, in this order:
1. **Contract.** Every acceptance criterion in the PR body and its linked issues: run it yourself and
   report `AC<k>: ran <command> → <result>` or `AC<k>: not run — <reason>`. Check the `Protects:`
   line: a proved bypass of a protected rule is blocking.
2. **Game rules** (`AGENTS.md`): no GPS, minimap, objective arrow or route line; the atlas marker
   moves only after an information request or a deliberate estimate; keyboard and controller paths
   both work; atlas and menu input does not leak into driving; real street connections, one-way
   access, building clearance and street-name ownership are kept; shift, fare and pause timing.
3. **Saves and settings:** older saves and control profiles still load, or are refused with a clear
   message and without destroying usable progress.
4. **Desktop shell:** no new renderer access to files, network or Node; CSP and the IPC surface stay
   narrow.
5. **Scope:** every changed file is one the PR needs; documents the change makes wrong are updated;
   `dist/`, `release/`, `node_modules/`, `.desktop-stage/` and `test-results/` stay out of Git.
6. **Tests:** would each new test fail without the behaviour it claims? Say how you checked.
7. **Checks:** `npm test`, `npm run build`, and for input, screens, rendering or desktop changes
   `xvfb-run -a sh -c 'xfwm4 --compositor=off >/tmp/cerea-review-wm.log 2>&1 & npm run test:desktop'`.
   Say which could not run here. Windows play, listening and physical controllers are the owner's
   checks; list them, do not claim them.

Blocking means a real player or developer would hit it through normal use. Crafted-input attacks on
helper scripts, and unlikely edge cases, are follow-ups. Prove each finding (run it, or name the test
that fails without the behaviour), or label it unverified.

Your review: the reviewed base and head SHAs, your tool and actual model, the verdict (approve |
approve after named fixes | rework | user decision), the AC lines, the findings R1..Rn (file:line,
blocking or not), the checks you ran and their results, and the verdict again last.
