# Git cheat sheet

Day-to-day commands for Closer. Each line says what the command does.

## Start of the day

```bash
git switch main        # go to the main branch
git pull               # download the latest main from GitHub
```

## Start new work

```bash
git switch -c feature/nudges   # create a new branch from where you are, and switch to it
```

## Save your work

```bash
git status                 # what changed? (red = not staged, green = staged)
git diff                   # line-by-line changes not yet staged
git add src/app/page.tsx   # stage one file for the next commit
git add -A                 # stage everything (check git status first!)
git commit -m "feat(nudges): add cooldown timer"   # save a snapshot with a message
```

## Share your work

```bash
git push -u origin feature/nudges   # first push of a new branch (-u remembers the link)
git push                            # later pushes on the same branch
```

## Open a pull request

```bash
gh pr create --fill   # open a PR from your branch (title and body from your commits)
gh pr view --web      # open the PR in the browser
gh pr status          # see your PRs and their checks
```

No `gh`? After pushing, GitHub shows a **"Compare & pull request"** button on the repo page.

## Update your branch with the latest main

```bash
git switch main
git pull
git switch feature/nudges
git merge main        # bring main's new commits into your branch
git push
```

## Resolve a merge conflict

When `git merge main` says **CONFLICT**:

1. `git status` lists the conflicted files ("both modified").
2. Open each file and find the markers:
   ```
   <<<<<<< HEAD
   your version
   =======
   the version from main
   >>>>>>> main
   ```
3. Edit the file to keep the right code, and delete the three marker lines.
4. Mark it resolved and finish:
   ```bash
   git add path/to/file
   git commit            # completes the merge (the message is prefilled)
   npm run check         # make sure it still builds
   git push
   ```

Want to give up and go back to before the merge? Run `git merge --abort`.

## After your PR is merged

```bash
git switch main
git pull
git branch -d feature/nudges   # delete the local branch (it's merged, nothing is lost)
```

## Oops

```bash
git restore path/to/file        # discard unstaged changes in a file (cannot be undone)
git restore --staged path/file  # unstage a file, keeping your changes
git commit --amend              # fix the last commit message (only if NOT pushed yet)
git stash                       # set changes aside temporarily
git stash pop                   # bring them back
git log --oneline -10           # last 10 commits
```

## Never

- `git push --force` on a shared branch or on `main`
- committing `.env.local` or any key
- committing directly to `main`
