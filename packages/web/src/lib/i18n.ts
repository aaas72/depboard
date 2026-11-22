/**
 * The UI's strings. English only for now, but every string goes through `t()` from day one,
 * so adding a language (including RTL ones) never means hunting for literals in components.
 * Insight sentences come from `@depboard/shared` (`describeInsight`), shared with the CLI.
 */
const en = {
  'header.projects': '{n} project|{n} projects',
  'search.label': 'Search packages or projects',
  'search.placeholder': 'Search packages or projects…',
  'filter.outdatedOnly': 'Outdated only',
  'action.rescan': 'Rescan',
  'action.rescanning': 'Rescanning…',
  'action.retry': 'Try again',
  'action.copy': 'Copy',
  'action.copied': 'Copied',
  'action.close': 'Close',
  'action.clearFilter': 'Show everything',
  'theme.label': 'Theme: {theme}. Change theme',
  'theme.system': 'system',
  'theme.light': 'light',
  'theme.dark': 'dark',

  'state.loading': 'Reading your projects…',
  'state.unauthorized.title': 'This page needs the link DepBoard printed',
  'state.unauthorized.body':
    'For your safety, DepBoard only answers the exact link shown in your terminal. Open that link again, or restart DepBoard to get a new one.',
  'state.offline.title': 'Can’t reach the DepBoard server',
  'state.offline.body':
    'It may have stopped. Start it again in your terminal, then open the new link it prints.',
  'state.error.title': 'DepBoard ran into a problem',
  'state.empty.title': 'No projects found in {roots}',
  'state.empty.body':
    'DepBoard looks for package.json files below the folder you give it. Point it at the folder that holds your projects:',
  'state.single':
    'Found 1 project. DepBoard shines when comparing several. Include its siblings with:',
  'state.noMatches': 'Nothing matches these filters.',

  'drift.title': 'What’s hiding in your projects',
  'drift.showAll': 'Show all {n} findings',
  'drift.showLess': 'Show fewer',
  'drift.allAgree': 'All {n} projects agree on every shared package. 🎉',
  'drift.filtering': 'Showing only:',
  'drift.kind.vulnerable-spread': 'Vulnerability',
  'drift.kind.version-drift': 'Version drift',
  'drift.kind.major-lag': 'Behind',
  'drift.family': 'Includes {list}',
  'drift.group.vulnerable-spread': 'Known vulnerabilities',
  'drift.group.version-drift': 'Different versions across projects',
  'drift.group.major-lag': 'Major versions behind',
  'drift.key.vulnerable-spread': 'vulnerable',
  'drift.key.version-drift': 'different versions',
  'drift.key.major-lag': 'far behind',

  'alert.failedLookups':
    'Couldn’t reach the npm registry for {n} package: its latest version is unknown.|Couldn’t reach the npm registry for {n} packages: their latest versions are unknown.',
  'alert.advisoriesIncomplete':
    'Vulnerability data is incomplete: some versions couldn’t be checked, so a missing shield doesn’t mean safe.',
  'alert.issues':
    'Skipped {n} package.json that couldn’t be read.|Skipped {n} package.json files that couldn’t be read.',

  'matrix.label': 'Packages by project',
  'matrix.package': 'Package',
  'matrix.latest': 'Latest',
  'matrix.rows': '{n} package|{n} packages',
  'legend.label': 'Legend',
  'legend.age': 'How far behind:',
  'legend.danger': 'How dangerous:',
  'legend.severities': 'L low · Mo moderate · H high · C critical',
  'legend.drift': 'Underline:',
  'legend.driftBody': 'same color = same release line, shown when projects disagree',
  'legend.none': 'up to date',
  'legend.patch': 'patch',
  'legend.minor': 'minor',
  'legend.major': 'major',
  'legend.unknown': 'unknown',
  'legend.estimated': 'Italic: not installed, estimated from package.json',

  'update.none': 'up to date',
  'update.patch': 'patch update available',
  'update.minor': 'minor update available',
  'update.major': 'major update available',
  'update.prerelease': 'prerelease; the final release is out',
  'update.unknown': 'update status unknown',
  'severity.low': 'low',
  'severity.moderate': 'moderate',
  'severity.high': 'high',
  'severity.critical': 'critical',
  'cell.notInstalled': 'not installed, estimated from {declared}',
  'cell.vulnerable': '{severity} vulnerability|{n} vulnerabilities, highest {severity}',

  'drawer.inProject': 'in {project}',
  'drawer.emptyTitle': 'Details',
  'drawer.emptyBody':
    'Select a cell to see its versions, known vulnerabilities, and the exact update command. Arrow keys and Enter work too.',
  'drawer.declared': 'In package.json',
  'drawer.installed': 'Installed',
  'drawer.notInstalled': 'Not installed',
  'drawer.latest': 'Latest',
  'drawer.status': 'Status',
  'drawer.depType': 'Type',
  'drawer.unknownLatest': 'Unknown',
  'drawer.lookup.not-found': 'Not on the npm registry (a private or local package).',
  'drawer.lookup.failed': 'The npm registry couldn’t be reached for this package.',
  'drawer.lookup.skipped':
    'Not a registry version (workspace, file, git, or alias), so it isn’t checked.',
  'drawer.estimated':
    'This dependency isn’t installed, so the version is estimated from package.json and its vulnerability status is unknown. Install dependencies in this project to check it.',
  'drawer.vulnUnknown': 'Vulnerability status couldn’t be checked for this version.',
  'drawer.advisories': 'Known vulnerabilities',
  'drawer.noAdvisories': 'No known vulnerabilities for this version.',
  'drawer.affected': 'Affected versions: {range}',
  'drawer.npm': 'View on npm',
  'drawer.update': 'Update',

  'update.willRun': 'DepBoard will run, in this project’s folder:',
  'update.button': 'Update to {version}',
  'update.buttonMajor': 'Update to {version}…',
  'update.running': 'Updating…',
  'update.unsupported':
    'Updating {manager} projects from DepBoard comes in a later version. You can run this in the project folder:',
  'update.confirmTitle': 'Update {name} from {from} to {to}?',
  'update.confirmBody':
    'This is a major update: it may include breaking changes. DepBoard will run this command in {project}:',
  'update.confirm': 'Run the update',
  'update.cancel': 'Cancel',
  'update.whatsNew': 'See what changed on npm',

  'project.back': 'Back to the matrix',
  'project.notFound': 'That project isn’t in this scan anymore.',
  'project.dependencies': 'dependencies',
  'project.devDependencies': 'devDependencies',
  'project.noneHere': 'None match these filters.',
  'project.open': 'Details for {name}',
  'project.allCurrent': 'all up to date',
  'project.outdated': 'outdated: {major} major · {minor} minor · {patch} patch',
  'project.vulnerable': '{n} with a known vulnerability|{n} with known vulnerabilities',
  'project.notInstalled':
    '{n} not installed: versions estimated from package.json, vulnerability status unknown.',
  'project.columnLink': 'Open {name}',

  'activity.title': 'Activity',
  'activity.running': '{n} update running|{n} updates running',
  'activity.count': '{n} update|{n} updates',
  'activity.duration': '{s} s',
  'activity.status.running': 'running',
  'activity.status.success': 'done',
  'activity.status.failed': 'failed',
  'activity.output': 'Command output',
  'activity.done': '✓ Done in {s} s. The matrix is up to date.',
  'activity.failedWith': '✕ The command failed (exit code {code}). The output above says why.',
  'alert.refreshFailed': 'The update finished, but the matrix couldn’t be refreshed. Press Rescan.',
  'drawer.otherProjects': 'Across your projects',
} as const;

export type MessageKey = keyof typeof en;
type Vars = Record<string, string | number>;

/**
 * Looks up a message. `{name}` placeholders are filled from `vars`. A message with `|` has a
 * singular and a plural form, picked by `vars.n` (enough for English; Intl.PluralRules later).
 */
export function t(key: MessageKey, vars: Vars = {}): string {
  const message: string = en[key];
  const forms = message.split('|');
  const form = forms.length > 1 && vars['n'] !== 1 ? (forms[1] ?? message) : (forms[0] ?? message);
  return form.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
