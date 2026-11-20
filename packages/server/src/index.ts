/** The only interface the server may listen on. See docs/agent/security.md. */
export const SERVER_HOST = '127.0.0.1';

export {
  resolveRoots,
  type ResolvedRoots,
  type ResolveRootsContext,
} from './roots/resolve-roots.js';
export { suggestRoots, COMMON_PROJECT_FOLDERS } from './roots/suggest-roots.js';
export {
  scanProjects,
  projectId,
  DEFAULT_SCAN_DEPTH,
  IGNORED_FOLDERS,
  type ScanResult,
  type ScannedProject,
  type ScannedDependency,
  type ScanIssue,
} from './scanner/scan-projects.js';
export { displayPath } from './lib/paths.js';
