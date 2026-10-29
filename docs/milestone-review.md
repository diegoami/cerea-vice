# Milestone review

A milestone is a release tag `vX.Y.Z` (or a release candidate `vX.Y.Z-rc.N`) on `main`. Before the
tag, one big review covers everything since the previous tag. No script forces it: the owner starts
it by calling a model's CLI directly, on whatever model they pick, in a fresh session. Adapted from
malpaco's `docs/milestone-review.md`.

## How a milestone happens

1. The owner calls a milestone, or the main session proposes one when a coherent set of work has
   landed (a GitHub milestone's issues closed, a playable slice).
2. The version bump and the release notes (`docs/releases/<version>.md`) land on `main`; that commit
   is the **candidate**.
3. The main session opens a **milestone issue** (label `milestone`) with: the proposed tag, the
   candidate's full SHA, the previous tag, the PRs merged since (including those merged without a PR
   review), the checks already run on the candidate, the claims to verify with `file:line`, the
   owner's decisions that are not defects, and the owner checks still outstanding (Windows play,
   listening, physical controller). From then on `main` takes only fixes for the milestone's
   findings until it is tagged.
4. The owner starts the review from any checkout of this repository, for example:

   ```sh
   opencode run -m <provider/model> --agent milestone-reviewer "Review milestone issue #123"
   claude -p --model <model> "/review-milestone 123"
   ```
5. The reviewer opens one issue per reproduced finding and posts one verdict, AGREE or BLOCK, on the
   milestone issue.
6. BLOCK: the findings are fixed in ordinary PRs, the candidate moves to the new `main` commit (the
   issue says so) and the owner starts a re-review. After a third round without AGREE the owner
   decides.
7. AGREE: the main session tags exactly the reviewed SHA and publishes the release with its Windows
   package and checksums (`README.md`). The owner may also tag without a review; the issue says so.

## Instructions for the reviewer

You are the independent reviewer of a Cerea Vice release candidate. You implemented none of it:
verify everything against the code, not commit messages or docs.

**Input.** The milestone issue number. `gh issue view <n> --comments` gives the tag, candidate SHA,
previous tag, PRs, checks and claims; for a re-review, the earlier verdict and the fix PRs. If any of
these is missing, say so on the issue and stop.

**Set up.** `git fetch origin --tags`, then create your own detached worktree at the candidate
(`git worktree add --detach <path> <sha>`); never switch, reset or clean the checkout you started
in. In that worktree run `npm ci`, `npm test`, `npm run build` and
`xvfb-run -a sh -c 'xfwm4 --compositor=off >/tmp/cerea-review-wm.log 2>&1 & npm run test:desktop'`,
noting any that cannot run here. Remove only that worktree when you finish.

**Review** `git diff <previous tag>..<sha>` and follow it into any file it touches or relies on.
`AGENTS.md` is the standard. Look hardest at: the navigation-knowledge rules (no GPS, minimap,
objective arrow or route line; the atlas marker), keyboard and controller parity and input-context
separation, taxi accounting and timing, saves and control profiles that would not load, real street
connections, one-way access and street-name ownership, the desktop shell's security boundary, and
tests that pass without the behaviour they claim. Aim at what the test suites cannot see.
Out-of-scope problems elsewhere count too; mark them so.

**Write to GitHub yourself**, and only this; never edit, commit, push, tag or merge:
- one issue per reproduced finding, with `MUST-FIX` or `follow-up` as the title's prefix, linking the
  milestone issue and SHA;
- always exactly one verdict comment on the milestone issue: AGREE, or BLOCK when any finding is
  MUST-FIX; the SHA reviewed, your tool and actual model, the checks you ran and their results, the
  issues you opened, what you checked and found clean, and the owner checks you could not do. A
  review that finds nothing still leaves this record.

Write comment and issue bodies to a file and pass `--body-file`. If posting fails, print the
complete text instead and say why.
