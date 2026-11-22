# depboard

## 0.1.0

### Minor Changes

- First release: discover what's hiding across all your projects.

  - **One matrix for every project:** point DepBoard at a folder and see every package against every project, with the version each one really installed.
  - **Findings in plain sentences:** known vulnerabilities, packages used at different major versions, and projects far behind. Click one to narrow the matrix to it.
  - **Known vulnerabilities** for every project from the npm advisory database, in a single request.
  - **Clear badges:** how far behind (`↑ patch`, `↑ minor`, `↑ major`) and how dangerous (`low`, `moderate`, `high`, `critical`), with a legend for every symbol.
  - **One project's view,** most urgent first.
  - **Update from the browser:** one package in one npm project, with the exact command shown first and a confirmation for major updates.
  - **`--summary`** prints the findings in the terminal, for scripts and CI.
  - Local only: listens on 127.0.0.1 with a per-run token, sends only package names and versions to the npm registry, no telemetry.
  - Windows, macOS, and Linux; Node.js 20.19 or newer.
