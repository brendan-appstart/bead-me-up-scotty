# Security policy

Scotty is a local web UI. It runs on your machine, reads and writes your beads
through the `bd` CLI, and serves a small HTTP API on `localhost`. A bug that lets
a web page you visit, another user, or another process change your beads, read
your files, or run commands is a security issue, and we want to hear about it.

## Supported versions

Security fixes go into the latest release only. Upgrade to the
[latest stable release](https://github.com/brendan-appstart/bead-me-up-scotty/releases/latest)
before reporting, if you can.

| Version | Supported |
| ------- | --------- |
| Latest release (0.4.x) | Yes |
| Older releases | No |

## Reporting a vulnerability

**Please don't open a public issue, pull request or discussion for a
vulnerability.**

Report it privately through GitHub instead:
[**Report a vulnerability**](https://github.com/brendan-appstart/bead-me-up-scotty/security/advisories/new)
(the *Security* tab, then *Report a vulnerability*). Only the maintainers can
see the report.

These help us reproduce it quickly:

- the Scotty version (shown in the sidebar) and how you installed it
  (Homebrew, `npm install -g .`, Docker, source checkout)
- your `bd` version and operating system
- the launch settings involved, such as `SCOTTY_ALLOWED_HOSTS`,
  `SCOTTY_READ_ONLY` or a reverse proxy in front of Scotty
- the steps or a proof of concept, and what an attacker gains

You should get a reply within a week. Once a fix ships, we publish a GitHub
security advisory and credit you, unless you'd rather stay anonymous.

## Scope

In scope: anything that crosses the boundaries Scotty is meant to keep. Examples
are cross-site or DNS-rebinding requests reaching the API, writes accepted in
read-only mode, path traversal through attachments or the folder picker, and
command or argument injection into `bd` or other tools Scotty runs.

Out of scope: setups that deliberately remove a protection, such as
`SCOTTY_ALLOWED_HOSTS=*` without anything else controlling who can reach the
server, or exposing Scotty to an untrusted network. Read-only mode is a viewing
preference, not access control (see the README). Vulnerabilities in `bd` itself
belong with the [beads project](https://github.com/gastownhall/beads).
