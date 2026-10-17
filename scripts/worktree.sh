#!/bin/sh
# Usage: npm run worktree -- <branch>   create .claude/worktrees/<branch> and link the notes
#        npm run worktree               link the notes into the current worktree
#
# The agent notes in .agents/ are gitignored, so a new worktree lacks them; linking
# them to the main checkout keeps one shared HANDOFF.md across parallel sessions.
set -eu

# The first entry of `git worktree list` is always the main working tree.
main=$(git worktree list --porcelain | sed -n '1s/^worktree //p')

if [ $# -gt 0 ]; then
  branch=$1
  target="$main/.claude/worktrees/$branch"
  if git -C "$main" show-ref --verify --quiet "refs/heads/$branch" ||
     git -C "$main" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    # A branch that exists only on origin becomes a local branch tracking it.
    git -C "$main" worktree add "$target" "$branch"
  else
    git -C "$main" worktree add -b "$branch" "$target" main
  fi
else
  target=$(git rev-parse --show-toplevel)
  if [ "$target" = "$main" ]; then
    echo "This is the main checkout; pass a branch name to create a worktree." >&2
    exit 1
  fi
fi

mkdir -p "$target/.agents"
for note in HANDOFF.md HANDOFF_ARCHIVE.md SIMULATOR-AUDIT.md; do
  link="$target/.agents/$note"
  if [ -L "$link" ]; then
    echo "Already linked .agents/$note"
  elif [ -e "$link" ]; then
    echo "Warning: .agents/$note is a separate copy; merge it into $main/.agents/$note, delete it and rerun" >&2
  elif ! git -C "$target" check-ignore -q ".agents/$note"; then
    # Older branches predate the ignore rule; a link there would be committable.
    echo "Skipped .agents/$note: not gitignored on this branch" >&2
  else
    # Linked even when main lacks the note: the first write through it creates it there.
    ln -s "$main/.agents/$note" "$link"
    echo "Linked .agents/$note"
  fi
done

echo "Worktree ready: $target"
echo "Serve it on its own port, e.g. npm run dev -- 8001"
