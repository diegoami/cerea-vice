# Review prompts

Paste one of these into any coding agent that can run shell commands and `gh` in a clone of this
repository. They name no tool or model: the owner chooses both. Fill in the values in angle brackets.
The briefs they point to are [`review-pr.md`](review-pr.md) and
[`milestone-review.md`](milestone-review.md).

Some tools also have shortcuts for the same briefs in this repository (an OpenCode agent and commands
under `.opencode/`, a command under `.claude/commands/`). They are optional conveniences; the prompts
below are the reference.

## One PR

```
You review one pull request in the GitHub repository diegoami/cerea-vice: PR #<number> at head <full head SHA>. You did not write it.

Work in a local clone of that repository. Read AGENTS.md, then docs/review-pr.md, and follow it. Fetch the PR head and review exactly that commit in your own detached worktree (`git worktree add --detach <new path> <head SHA>`). Never switch, reset or clean the checkout you started in, and remove only your worktree at the end. Verify against the code, not the PR description.

Post exactly one review on the PR with `gh pr review <number> --comment --body-file <file>`, and nothing else. Never edit tracked files, commit, push, merge, approve, request changes or label. In the review, state the base and head SHAs you reviewed, the tool and model you actually are, the verdict, the acceptance-criteria lines, the findings with file:line and whether each is blocking, the checks you ran with their results, and the verdict again last. If posting fails, print the full text and the error instead.
```

## Milestone

```
You are the independent reviewer of a release candidate for the GitHub repository diegoami/cerea-vice. You did not implement any of it.

Work in a local clone of that repository. Read AGENTS.md, then docs/milestone-review.md, and follow its section "Instructions for the reviewer" exactly for milestone issue #<number>. The issue gives the proposed tag, the candidate commit, the previous tag, the merged PRs, the checks already run and the claims to verify; get it with `gh issue view <number> --comments`.

Review the candidate commit in your own detached worktree (`git worktree add --detach <new path> <candidate SHA>`). Never switch, reset or clean the checkout you started in, and remove only the worktree you created when you finish.

You may write to GitHub only as that document says: one issue per reproduced finding, and exactly one verdict comment, AGREE or BLOCK, on issue #<number>. Never edit tracked files, commit, push, tag, merge or publish a release. In the verdict, state the exact SHA you reviewed, the tool and model you actually are, the checks you ran with their results, the issues you opened, what you checked and found clean, and the checks you could not do here. If posting fails, print the full text and the error instead.
```

## Milestone re-review (after a BLOCK and its fix PRs)

```
You are the independent reviewer of a release candidate for the GitHub repository diegoami/cerea-vice, and this is a re-review. You did not implement any of it.

Work in a local clone of that repository. Read AGENTS.md and docs/milestone-review.md, and follow its section "Instructions for the reviewer" for milestone issue #<number>. Read the whole issue with `gh issue view <number> --comments`: the earlier verdict, the findings it opened, the fix PRs, and the new candidate commit stated in the latest comment. Review the full range from the previous tag to the new candidate, and confirm each earlier finding is actually fixed; an earlier verdict does not carry over to a new commit.

Use your own detached worktree at the new candidate, never touch the checkout you started in, and remove only your worktree at the end. Write to GitHub only as the document says: one issue per new reproduced finding, and exactly one AGREE or BLOCK verdict comment on #<number>, with the SHA reviewed, the tool and model you actually are, the checks you ran and their results, and what you could not check. Never edit, commit, push, tag, merge or publish.
```
