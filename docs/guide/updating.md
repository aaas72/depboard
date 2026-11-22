# Updating packages

DepBoard is read-only until you ask for an update. When you do, it shows the exact command first and
runs only that.

## Update one package in one project

1. Select the cell: the package, in the project you want to update.
2. The details panel shows the command, for example:

   ```
   npm install lodash@4.18.1 --no-audit --no-fund
   ```

3. Press **Update to 4.18.1**. The command runs in that project's folder, and its output streams live
   into the **Activity** panel at the bottom.
4. When it succeeds, DepBoard scans again and the matrix shows the new version.

   ![A finished update: the command and its output in the Activity panel](../media/screenshots/update-output.png)

A dev dependency keeps its place: the command includes `--save-dev`.

## Major updates ask first

A major update can break code. Its button ends with `…`: pressing it opens a dialog that repeats the
exact command and links to the package's versions on npm. Nothing runs until you press **Run the
update**. The dialog's focus starts on **Cancel**.

![The confirmation for a major update, with the exact command](../media/screenshots/update-confirm.png)

## What DepBoard will and won't do

- It runs `npm` directly, never through a shell, so a package name can never become a command.
- It updates only a package the project already declares, to an exact version.
- It runs one update per project at a time.
- It never touches other projects, and never runs anything you didn't confirm.
- If the command fails, the Activity panel shows its exit code and output, and the matrix stays as it
  was.

## pnpm, yarn, and bun projects

DepBoard reads projects of every package manager, but in this version it updates **npm** projects
only. For the others, the details panel shows the command to run yourself in the project folder.
Running `npm install` inside a pnpm or yarn workspace could damage it, so DepBoard doesn't try.
Updates for pnpm, yarn, and bun are on the [roadmap](../roadmap.md).
