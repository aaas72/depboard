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
  'legend.none': 'up to date',
  'legend.patch': 'patch',
  'legend.minor': 'minor',
  'legend.major': 'major',
  'legend.unknown': 'unknown',
  'legend.vulnerable': 'known vulnerability (L · Mo · H · C)',
  'legend.estimated': 'italic: not installed, estimated from package.json',

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
