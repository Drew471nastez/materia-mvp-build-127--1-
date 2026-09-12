# Admin access

`/admin/blog` writes, edits and deletes posts on storelib.com, and
`/api/admin/spam-purge` behind the same gate can delete user accounts. One
cookie opens both.

## What changed, and what to do now

The gate used to be three constants in the repository: a username, a password,
and the exact cookie value they issued. Anybody who could read the repository
could set that cookie by hand, skip the login, and reach both. The values are
in the git history and cannot be taken out of it, so they are treated as
public and have been retired:

- The cookie is now a signed, dated token. It cannot be computed from the
  repository, it expires after 30 days, and rotating the signing key
  invalidates every one already issued.
- The username and password come from the environment.

**Set this in the environment, or nobody can sign in:**

```
BLOG_ADMIN_PASSWORD=<a new password, not the one that was in the repo>
```

Optional:

```
BLOG_ADMIN_USER=<the sign-in name; "storelib" if unset>
BLOG_ADMIN_SECRET=<the signing key; the Supabase service role key if unset>
```

There is deliberately no default password. Until `BLOG_ADMIN_PASSWORD` is set
the login page says so and refuses everybody, which is the right state for a
credential that has leaked.

If the old password was used anywhere else, change it there too. Setting
`BLOG_ADMIN_SECRET` (and changing it later) is how you sign everybody out:
every issued cookie stops verifying the moment the key changes.
