# Git identity and deployments

Before every commit in this repository, configure and verify the Git identity
used by the successful owner-authored commit `7ccc8cf80b3d58aa9329e4dfc701d3f8d14bb5ce`:

```bash
git config --local user.name Drew471nastez
git config --local user.email 187374842+Drew471nastez@users.noreply.github.com
git var GIT_AUTHOR_IDENT
git var GIT_COMMITTER_IDENT
```

Both effective identities must be
`Drew471nastez <187374842+Drew471nastez@users.noreply.github.com>`.
Check for environment or command-line overrides if either differs, and correct
them before committing. Do not use a generic Codex identity or an identity
inherited from the environment. Use repository-local configuration so other
repositories are unaffected. The owner's GitHub username is `Drew471nastez`;
the verified working commit email above is the deployment identity.

After committing, verify the commit's author and committer with
`git show -s --format=fuller HEAD` before pushing. Do not rewrite existing
history, amend published commits, or force-push to repair an older identity.
