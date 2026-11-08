import { defaultSources, formatNotice, guidelineNote, type DeclaredGuideline, Locale, parseProcess, ProcessConfig, ProcessSection, SectionSource, t, defaultProcess, validationKey } from '@ebrain-lab/weaver-markdown';
import { fetchProcessFile, mapLimit, PROCESS_READ_LIMIT, type FetchFn } from '@ebrain-lab/weaver-github';

export { mapLimit } from '@ebrain-lab/weaver-github';

/** How one repository tracks its work, as the tool prints it. Part of the JSON contract. */
export interface ProcessReport {
  repository: string;
  /** `read`: the repository has the file. `missing`: it has none, so the defaults apply. `failed`: it could not be read, so the defaults are shown. */
  file: 'read' | 'missing' | 'failed';
  /** For each section, whether the file set it or it is the default. */
  sources: Record<ProcessSection, SectionSource>;
  process: ProcessConfig;
  /** What is wrong in the file, in the chosen language. */
  issues: { severity: string; code: string; message: string }[];
  /** Why the file could not be read. */
  error?: { code: string; message: string };
  /** The guideline that applies to the repository (DEC-019), or null. Showing it never changes the repository's rules. */
  guideline: ReportedGuideline | null;
  /** The repository has no process file and a guideline applies, so a starting file can be offered. */
  startable: boolean;
}

/** A guideline as the tool prints it. Part of the JSON contract. */
export interface ReportedGuideline {
  /** Where the reference was declared: the repository's process file, the root file, or the personal file. */
  source: 'process' | 'root' | 'personal';
  repository: string;
  path: string;
  ref: string | null;
  /** The file that declared it, when it is not the repository's own. */
  file: string | null;
}

export { PROCESS_READ_LIMIT };

/**
 * Reads the process of every repository, a few at a time. A repository that has no file or cannot
 * be read shows the defaults and says so, and never stops the others.
 */
export async function readProcesses(
  token: string,
  repositories: readonly string[],
  locale: Locale,
  fetchFn?: FetchFn,
  setupGuideline?: DeclaredGuideline,
): Promise<ProcessReport[]> {
  return mapLimit(repositories, PROCESS_READ_LIMIT, async (repository): Promise<ProcessReport> => {
    const withGuideline = (file: ProcessReport['file'], recorded?: Parameters<typeof guidelineNote>[1]) => {
      const note = guidelineNote(file, recorded, setupGuideline);
      return {
        guideline: note ? reported(note.guideline) : null,
        startable: note?.startable ?? false,
      };
    };
    const result = await fetchProcessFile(token, repository, {}, fetchFn);
    const defaults = { process: defaultProcess(), sources: defaultSources() as Record<ProcessSection, SectionSource> };

    if (result.status === 'read') {
      const parsed = parseProcess(`${repository}/.weaver/process.yaml`, result.text);
      return {
        repository,
        file: 'read',
        sources: parsed.sources,
        process: parsed.process,
        issues: parsed.issues.map((issue) => ({ severity: issue.severity, code: issue.code, message: t(validationKey(issue.code), locale, issue.args) })),
        ...withGuideline('read', parsed.guidelineRef),
      };
    }
    if (result.status === 'failed') {
      return { repository, file: 'failed', ...defaults, issues: [], error: { code: result.error.code, message: formatNotice(result.error, locale) }, ...withGuideline('failed') };
    }
    // `unchanged` cannot happen without an ETag; it is treated like a file that has nothing new.
    return { repository, file: 'missing', ...defaults, issues: [], ...withGuideline('missing') };
  });
}

function reported(declared: DeclaredGuideline): ReportedGuideline {
  return {
    source: declared.source,
    repository: declared.ref.repository,
    path: declared.ref.path,
    ref: declared.ref.ref ?? null,
    file: declared.file ?? null,
  };
}

/** One line per repository, then its problems, for `--text`. */
export function processText(reports: readonly ProcessReport[]): string {
  const lines: string[] = [];
  for (const r of reports) {
    const sources = (['columns', 'evidence', 'stale', 'task'] as const).map((section) => `${section}=${r.sources[section]}`).join(' ');
    const guideline = r.guideline ? `\tguideline=${r.guideline.repository}@${r.guideline.ref ?? 'default'}(${r.guideline.source})${r.startable ? ' can-start' : ''}` : '';
    lines.push(`${r.repository}\t${r.file}\t${sources}${guideline}`);
    for (const issue of r.issues) lines.push(`  ${issue.severity}: ${issue.message}`);
    if (r.error) lines.push(`  error: ${r.error.message}`);
  }
  return lines.length ? `${lines.join('\n')}\n` : '';
}
