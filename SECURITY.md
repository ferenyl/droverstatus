# Security policy

## Reporting a vulnerability
Please report privately via GitHub Security Advisories ("Report a vulnerability" under the repository's Security tab). Do not open a public issue.

## Supported versions
Only the latest release (and `main`) receives security fixes.

## Threat model
droverstatus can launch, close and kill Claude agents (via `drover.sh`) and send them messages. Treat access to it as shell-level access to your user account.

- By default the server binds to `127.0.0.1` (`--bind`/`BIND_ADDR` can change this, which is unsafe). It rejects requests whose `Host` header is not `127.0.0.1`, `localhost`, `[::1]` or the bound IP; when bound to a wildcard address (`0.0.0.0`/`::`) any IP literal is also accepted. Other hostnames are always rejected (DNS-rebinding guard).
- There is **no authentication and no CSRF token**. Anything that can reach the port can act as you.
- There is no auth in any configuration; the server prints a no-auth warning at every start, and a stronger one when bound to a non-loopback address.
- Do not expose it via port forwarding, a reverse proxy or `0.0.0.0` binding.
- The app only reads drover state files; all mutations go through `drover.sh` using `execFile` (no shell), with validated ids.
- Browser mutations (anything but `GET`/`HEAD`) must carry an `Origin` whose host passes the same Host check and that matches the request `Host` (or the dev UI port); non-browser clients (curl, local scripts) are not restricted, so any local process can use the API.
- If you run it as a service, use the unit in `docs/droverstatus.service` (extra hardening there is opt-in).
