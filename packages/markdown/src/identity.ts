import type { Artifact, RequirementArtifact, TaskArtifact } from './types';

/** Repository names are compared without case; an absent name is not an identity. */
export function sameRepository(left?: string, right?: string): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

/** Normalize a host or IP address and an optional explicit port without inventing defaults. */
export function normalizeServerAddress(value: string): string | undefined {
  const address = value.trim();
  const match = /^(\[[^\]]+\]|[^:\s/?#@]+)(?::(\d+))?$/.exec(address);
  if (!match) return undefined;
  let host = match[1].toLowerCase();
  if (host.startsWith('[')) {
    try {
      const parsed = new URL(`http://${host}/`);
      if (!parsed.hostname.startsWith('[')) return undefined;
      host = parsed.hostname.toLowerCase();
    } catch { return undefined; }
  } else {
    if (!/^(?=.{1,253}$)(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)*[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(host)) return undefined;
    if (/^[\d.]+$/.test(host)) {
      const octets = host.split('.');
      if (octets.length !== 4 || octets.some((part) => !/^(?:0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)) return undefined;
    }
  }
  if (match[2] === undefined) return host;
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  return `${host}:${port}`;
}

/** Compare normalized addresses; an explicit port is distinct from an omitted port. */
export function sameServer(left?: string, right?: string): boolean {
  const a = left && normalizeServerAddress(left);
  const b = right && normalizeServerAddress(right);
  return Boolean(a && b && a === b);
}

/** Parse an origin URL without retaining credentials or transport scheme. */
export function repositoryFromRemote(remote: string): { repository: string; server: string } | undefined {
  let address: string;
  let pathname: string;
  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(remote)) {
      const url = new URL(remote);
      if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol)) return undefined;
      const authority = /^[a-z][a-z\d+.-]*:\/\/([^/]+)/i.exec(remote)?.[1];
      if (!authority) return undefined;
      address = authority.slice(authority.lastIndexOf('@') + 1);
      pathname = url.pathname.replace(/^\/+/, '');
    } else {
      const match = /^(?:[^@\s/]+@)?(\[[^\]]+\]|[^:\s/]+):(.+)$/.exec(remote);
      if (!match) return undefined;
      address = match[1];
      pathname = match[2];
    }
  } catch { return undefined; }
  const match = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(pathname);
  const server = normalizeServerAddress(address);
  if (!server || !match) return undefined;
  return { repository: `${match[1]}/${match[2]}`, server };
}

/** Resolve legacy unqualified references only when they are unambiguous. */
export function requirementForTask(task: TaskArtifact, artifacts: readonly Artifact[]): RequirementArtifact | undefined {
  const candidates = artifacts.filter((a): a is RequirementArtifact => a.kind === 'requirement' && a.id === task.requirement);
  const explicit = task.requirementRepository;
  if (explicit) {
    const matches = candidates.filter((a) => sameRepository(a.repository, explicit) && (!task.requirementServer || sameServer(a.repositoryServer, task.requirementServer)));
    return matches.length === 1 ? matches[0] : undefined;
  }
  const scoped = candidates.filter((a) => a.sourceScope && a.sourceScope === task.sourceScope);
  if (scoped.length === 1) return scoped[0];
  if (scoped.length > 1) return undefined;
  const local = candidates.filter((a) => sameRepository(a.repository, task.repository) && (!task.repositoryServer || !a.repositoryServer || sameServer(a.repositoryServer, task.repositoryServer)));
  if (local.length === 1) return local[0];
  if (local.length > 1) return undefined;
  return candidates.length === 1 ? candidates[0] : undefined;
}
