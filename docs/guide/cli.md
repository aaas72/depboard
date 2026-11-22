# Command-line reference

```
depboard [paths...] [options]
```

`paths` are the folders to scan. With none, DepBoard scans the current folder.

## Options

| Option            | Default            | Effect                                                      |
| ----------------- | ------------------ | ----------------------------------------------------------- |
| `--port <n>`      | a random free port | Port for the local server, 1–65535                          |
| `--no-open`       |                    | Print the link instead of opening the browser               |
| `--summary`       |                    | Print the findings and exit: no server, no browser          |
| `--depth <n>`     | `6`                | How many folders deep to look for projects, 1–32            |
| `-y`, `--yes`     |                    | Skip confirmations, such as scanning your whole home folder |
| `--debug`         |                    | Detailed logs and stack traces on stderr                    |
| `-v`, `--version` |                    | Print the version                                           |
| `-h`, `--help`    |                    | Print the help                                              |

## Examples

```bash
npx depboard                          # the current folder
npx depboard ~/projects               # one folder
npx depboard ~/work ~/clients         # several folders, one matrix
npx depboard ~/projects --summary     # findings in the terminal, then exit
npx depboard ~/projects --no-open     # print the link, open it yourself
npx depboard ~/projects --port 4400   # a fixed port
```

## Output

- The summary and the link go to **stdout**. Warnings and logs go to **stderr**.
- The link contains a token created for this run. Treat it like a password while DepBoard runs; it
  stops working when DepBoard stops.

## Exit codes

| Code | Meaning                                                           |
| ---- | ----------------------------------------------------------------- |
| `0`  | Success                                                           |
| `1`  | Something went wrong while running; the message says what and why |
| `2`  | Invalid usage, such as an unknown option or a depth out of range  |

## In scripts and CI

`--summary` scans, prints the findings, and exits without starting a server:

```bash
npx depboard ~/projects --summary
```

Without a terminal (in CI or a pipe), DepBoard never waits for an answer: anything that needs
confirmation fails with a message telling you to pass `--yes`.

## Errors you may see

| Message                                               | What to do                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| `Port 4400 is already in use…`                        | Pick another `--port`, or leave it out to use any free port |
| `Can't scan C:\: DepBoard doesn't scan whole drives.` | Point it at the folder that holds your projects             |
| `Scanning your whole home folder needs confirmation.` | Pass `--yes`, or point it at your projects folder           |
| `Folder not found: …`                                 | Check the path                                              |
| `No projects found in …`                              | Run one of the suggested commands, or check the path        |

For anything else, run again with `--debug` and [open an issue](https://github.com/aaas72/depboard/issues/new/choose).
