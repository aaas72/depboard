# DepBoard

**Discover what's hiding in your projects in 10 seconds.**

```bash
npx depboard ~/projects
```

DepBoard scans the folder you point it at and shows every npm dependency of every project in one matrix,
so you finally see that React runs at three different versions across seven projects,
or that a vulnerable package sits in four of them.

> 🚧 **Work in progress.** The first release (`0.1.0`) is being built. Star the repo to follow along.

## Planned for 0.1

- **One matrix:** packages × projects, each cell colored by how far behind it is (patch / minor / major)
- **Drift insights:** plain sentences such as _"react is used at 3 different versions across 7 projects"_
- **Vulnerabilities:** known advisories for every project, from one request
- **Update from the browser:** with confirmation and the exact command shown first

## Security & privacy

- Runs locally and listens on `127.0.0.1` only, protected by a per-session token.
- Scans only the folders you give it. Never your whole disk.
- Sends package names and versions to the npm registry, and nothing else. No telemetry, no account, no cloud.

## Requirements

Node.js 20.19 or newer.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). The published package bundles open-source dependencies (Fastify, React, and others), all under permissive licenses; their notices ship in `dist/THIRD_PARTY_LICENSES.md`.
