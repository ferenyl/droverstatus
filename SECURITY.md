# Security policy

## Reporting a vulnerability
Please report privately via GitHub Security Advisories ("Report a vulnerability" under the repository's Security tab). Do not open a public issue.

## Threat model
droverstatus can launch, close and kill Claude agents (via `drover.sh`) and send them messages. Treat access to it as shell-level access to your user account.

- The server binds to `127.0.0.1` only and rejects requests whose `Host` header is not `127.0.0.1`, `localhost` or `[::1]` (DNS-rebinding guard).
- There is **no authentication and no CSRF token**. Anything that can reach the port as localhost can act as you.
- Do not expose it via port forwarding, a reverse proxy or `0.0.0.0` binding.
- The app only reads drover state files; all mutations go through `drover.sh` using `execFile` (no shell), with validated ids.
