# Security policy

## Reporting a vulnerability
Please report privately via GitHub Security Advisories ("Report a vulnerability" under the repository's Security tab). Do not open a public issue.

## Threat model
droverstatus can launch, close and kill Claude agents (via `drover.sh`) and send them messages. Treat access to it as shell-level access to your user account.

- By default the server binds to `127.0.0.1`. `--bind <ip>` / `BIND_ADDR` listens on another address (a warning is printed at startup for non-loopback).
- Requests whose `Host` header is not loopback (`127.0.0.1`, `localhost`, `[::1]`) or the bound IP are rejected (DNS-rebinding guard); with a wildcard bind (`0.0.0.0`, `::`) any IP literal is accepted.
- There is **no authentication and no CSRF token**. Anyone who can reach the port can launch and stop agents as you.
- Binding beyond loopback, port forwarding or a reverse proxy is only for trusted networks and at your own risk.
- The app only reads drover state files; all mutations go through `drover.sh` using `execFile` (no shell), with validated ids.
