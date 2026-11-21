# Security policy

DepBoard runs a local server that can run `npm install` in your projects, so we take security reports
seriously.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately through GitHub:
**Security → Report a vulnerability** on [github.com/aaas72/depboard](https://github.com/aaas72/depboard/security/advisories/new).

Include what you found, how to reproduce it, and the DepBoard, Node.js, and OS versions. You'll get an
answer within 7 days. Once a fix is released, we credit you in the advisory unless you'd rather stay
anonymous.

## Supported versions

Only the latest published version gets security fixes.

## In scope

- Reaching the local server from another website or another user on the machine (token, Host, and
  Origin checks)
- Making DepBoard run a command, or write to a file, that the user didn't confirm
- Reading files outside the folders the user chose
- Sending anything other than package names and versions to the network

The design behind these rules is in [docs/agent/security.md](docs/agent/security.md).
