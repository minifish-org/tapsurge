# Public release preparation — 2026-09-22

## Validation

`npm run lint`, `npm run build`: passed. Browser smoke: page loads, a tap increments the counter, source link is present.

Gitleaks found no secrets in the fetched local Git history at preparation time.
This is a best-effort check, not a guarantee that every possible secret is detected.

## Scope and limitations

No physical iPad multitouch, long-running booth session, or offline reload was tested in this release pass.

See README.md for license, setup and project status; SECURITY.md describes support
and private reporting. Third-party material retains its upstream license.
