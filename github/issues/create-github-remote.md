# Create GitHub Remote for App Migration Repo

## Summary

The app-migration repo has been scaffolded locally with an initial commit on `main`. It needs a private GitHub remote created and the initial commit pushed.

## Steps

1. Create a private GitHub repo: `gh repo create app-migration --private --source=. --remote=origin`
2. Push main branch: `git push -u origin main`
3. Verify the remote is set: `git remote -v`
4. Rename this file to `GH-{number}_create-github-remote.md` after creating the issue (or delete it — this is a one-time setup task, not a persistent issue)

## Acceptance Criteria

- [ ] Private repo exists at github.com/[user]/app-migration
- [ ] `main` branch pushed with initial scaffold commit
- [ ] `git remote -v` shows origin pointing to the new repo

## Notes

This is a docs-only project — no dev branch, no deploy.py. All work happens on `main`.
