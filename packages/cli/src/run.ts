import * as path from 'path';
import {
  Artifact,
  DEFAULT_STALE_DAYS,
  PROJECT_STATUS_FOR_COLUMN,
  honoredException,
  RequirementArtifact,
  formatNotice,
  findMismatches,
  Locale,
  LOCALES,
  loadWorkspace,
  sameServer,
  MessageArgs,
  MessageKey,
  normalizeIssueUrl,
  effectiveRepositories,
  planTaskFields,
  parseIssueUrl,
  repositoryFromRemote,
  Setup,
  taskIdsOfPull,
  t,
} from '@ebrain-lab/weaver-markdown';
import { fetchCompletionEvidence, fetchIssue, fetchIssueBody, NoticeError, placeWithRules, readMergedPulls, readProject, type FetchFn } from '@ebrain-lab/weaver-github';
import { attribution, executeActions, finishActions, parseApproved, PlannedAction, ReportItem, Skipped } from './actions';
import { Args, parseArgs } from './args';
import { parseColumn, planCardMove, planEvidenceAttach } from './cardActions';
import { CliCard, findCards, toCliCards } from './cards';
import { Deps, EXIT, SCHEMA } from './contract';
import { planProjectAdd } from './projectAdd';
import { runInit } from './init';
import { processText, readProcesses, type ProcessReport } from './processCommand';
import { openGuidelineCopies } from './guidelineCopies';
import { planProcessStart } from './processStart';
import { loadSetup } from './setup';
import { planReconcile } from './reconcile';
import { nextTaskNumber, planTaskCreate, renderTaskFile, slugOf, taskIdOf, taskListLine, usedTaskTexts } from './taskCreate';
import { hasTaskTitleCandidate, taskIssueCandidates, taskIssueInventory, taskPullInventory } from './taskIssueInventory';
import { observeExistingTaskPull, observeMergedTaskPull } from './taskExistingPull';
import { verifyTaskFiles } from './taskExistingPull';
import { operationReservationVisible, registrationIntentDigest, registrationMarker, reserveRecovery, taskReservationRefs } from './taskReservation';

export { Deps, EXIT, SCHEMA } from './contract';

export async function run(argv: readonly string[], deps: Deps): Promise<number> {
  const parsed = parseArgs(argv);
  const wantsText = !('unknown' in parsed) && parsed.flags.has('text');
  const lang = !('unknown' in parsed) && parsed.options.lang ? parsed.options.lang : deps.env.WEAVER_LANG;
  const locale: Locale = (LOCALES as readonly string[]).includes(lang ?? '') ? (lang as Locale) : 'en';
  const say = (key: MessageKey, args?: MessageArgs): string => t(key, locale, args);

  /** A failure is JSON on stdout for an agent, and a sentence on stderr for a person. */
  const report = (code: string, message: string, details?: unknown): void => {
    if (wantsText) deps.err(`${message}\n`);
    else deps.out(`${JSON.stringify({ schema: SCHEMA, error: { code, message, ...(details !== undefined ? { details } : {}) } })}\n`);
  };
  const fail = (exit: number, key: MessageKey, args?: MessageArgs): number => {
    report(key, say(key, args));
    return exit;
  };

  if ('unknown' in parsed) return fail(EXIT.usage, 'cli.unknown-command', { command: parsed.unknown });
  const args: Args = parsed;
  if (args.flags.has('help') || !args.command) {
    deps.out(`${say('cli.usage')}\n`);
    return args.command || args.flags.has('help') ? EXIT.ok : EXIT.usage;
  }
  if (args.command !== 'list' && args.command !== 'show' && args.command !== 'project' && args.command !== 'task' && args.command !== 'card' && args.command !== 'evidence' && args.command !== 'reconcile' && args.command !== 'init' && args.command !== 'process') return fail(EXIT.usage, 'cli.unknown-command', { command: args.command });
  if (args.command === 'init') return runInit(deps, locale, wantsText, args.options.root === undefined ? undefined : path.resolve(deps.cwd, args.options.root));
  if (args.command === 'show' && args.positional.length === 0) {
    return fail(EXIT.usage, 'cli.missing-argument', { command: 'show', argument: 'a card' });
  }

  if (args.command === 'process' && args.positional[0] === 'start' && !args.options.repository) {
    return fail(EXIT.usage, 'cli.missing-argument', { command: 'process start', argument: '--repository <owner/name>' });
  }

  if (args.command === 'project' && (args.positional[0] !== 'add' || args.positional.length < 2)) {
    return fail(EXIT.usage, 'cli.missing-argument', { command: 'project add', argument: 'an Issue address' });
  }

  if (args.command === 'task' && (args.positional[0] !== 'create' || !args.options.title || !args.options.requirement)) {
    return fail(EXIT.usage, 'cli.missing-argument', { command: 'task create', argument: '--title and --requirement' });
  }

  if (args.command === 'card' && (args.positional[0] !== 'move' || args.positional.length < 2 || !args.options.to)) {
    return fail(EXIT.usage, 'cli.missing-argument', { command: 'card move', argument: 'a card and --to <column>' });
  }
  if (args.command === 'evidence' && (args.positional.length < 2 || (args.positional[0] !== 'inspect' && args.positional[0] !== 'attach') || (args.positional[0] === 'attach' && !args.options.pull))) {
    return fail(EXIT.usage, 'cli.missing-argument', { command: 'evidence', argument: 'inspect <task or Issue>, or attach <card> --pull <number or address>' });
  }

  const root = path.resolve(deps.cwd, args.options.root ?? '.');
  const loaded = await loadSetup(root, deps, locale);
  if (!loaded.ok) {
    return loaded.reason === 'none'
      ? fail(EXIT.failed, 'cli.no-setup', { root })
      : fail(EXIT.failed, 'cli.config-invalid', { path: loaded.path, detail: loaded.detail });
  }
  const { setup } = loaded;
  for (const warning of loaded.warnings) deps.err(`${warning}\n`);
  const token = await deps.token();
  if (!token) return fail(EXIT.failed, 'cli.no-token');

  const read = await readProject(token, setup.project, setup.repositories?.map((r) => r.repository), deps.fetch);
  if (!read.ok) {
    report(read.error.code, formatNotice(read.error, locale));
    return EXIT.failed;
  }

  // Without a list, the repositories are the ones that have cards on the Project.
  const repositories = effectiveRepositories(setup, read.read.cards.map((card) => card.repository)).map((r) => r.repository);

  /** Shows the plan, takes the confirmations, runs what was approved, and prints the result. */
  const confirmAndRun = async (actions: PlannedAction[], skipped: Skipped[] = [], options: { report?: ReportItem[]; dryRun?: boolean; context?: unknown; recheck?: () => Promise<unknown>; registration?: boolean; registrationRecheck?: boolean } = {}): Promise<number> => {
    if (options.context !== undefined && !options.dryRun) deps.err(`${t(options.registration ? 'cli.task-create.context' : 'cli.reconcile.context', locale)}\t${JSON.stringify(options.context)}\n`);
    const results = await executeActions(actions, {
      locale,
      approved: parseApproved(args.options.approve),
      interactive: deps.interactive && !options.dryRun,
      ask: deps.ask,
      log: deps.log,
      actor: deps.env.WEAVER_ACTOR ?? 'steward',
      onBehalfOf: await deps.login(),
      now: () => deps.now(),
      note: (text) => deps.err(text),
    });
    let recheck: unknown;
    if (options.recheck && results.some((result) => result.outcome === 'done' || result.outcome === 'failed')) {
      try { recheck = await options.recheck(); }
      catch { recheck = { status: 'unavailable', reason: t('cli.reconcile.recheck-unavailable', locale) }; }
      if (results.some((result) => result.outcome === 'failed') && typeof recheck === 'object' && recheck !== null && 'status' in recheck && recheck.status === 'read') {
        recheck = { ...recheck, status: 'incomplete', resolved: [], reason: t('cli.reconcile.recheck-action-failed', locale) };
      }
    }
    return finishActions(results, deps, locale, wantsText, { skipped, report: options.report, dryRun: options.dryRun, context: options.context, recheck, registration: options.registration, registrationRecheck: options.registrationRecheck });
  };

  if (args.command === 'process' && args.positional[0] === 'start') {
    const wantedStart = args.options.repository?.toLowerCase();
    const target = repositories.find((name) => name.toLowerCase() === wantedStart);
    if (!target) return fail(EXIT.usage, 'cli.repository-unregistered', { repository: args.options.repository ?? '' });
    const kept = await openGuidelineCopies(deps);
    const plan = await planProcessStart({
      token,
      login: await deps.login(),
      locale,
      repository: target,
      guideline: setup.guideline,
      cards: read.read.cards.filter((card) => card.repository.toLowerCase() === target.toLowerCase()),
      copies: kept.store,
      now: deps.now(),
      fetchFn: deps.fetch as unknown as FetchFn | undefined,
    });
    await kept.save();
    if (!plan.ok) return fail(EXIT.failed, plan.refusal.code, plan.refusal.args);
    for (const note of plan.notes) deps.err(`${formatNotice(note, locale)}\n`);
    return confirmAndRun([plan.action]);
  }

  if (args.command === 'process') {
    const wanted = args.options.repository?.toLowerCase();
    const reports = await readProcesses(
      token,
      repositories.filter((name) => !wanted || name.toLowerCase() === wanted),
      locale,
      deps.fetch as unknown as FetchFn | undefined,
      setup.guideline,
    );
    if (wantsText) deps.out(processText(reports));
    else deps.out(`${JSON.stringify({ schema: SCHEMA, repositories: reports })}\n`);
    return EXIT.ok;
  }

  if (args.command === 'project') {
    const plan = planProjectAdd(args.positional.slice(1), {
      token,
      project: setup.project,
      repositories,
      onProject: read.read.cards.map((card) => card.url),
      fetch: deps.fetch,
    });
    return confirmAndRun(plan.actions, plan.skipped);
  }

  const workspaceFiles = await deps.files(root);
  const workspace = loadWorkspace(workspaceFiles);
  const artifacts: Artifact[] = workspace.artifacts;
  const workspaceComplete = !workspace.issues.some((issue) => issue.severity === 'error' && !artifacts.some((artifact) => artifact.path === issue.path));
  if (args.command === 'task') {
    const matches = artifacts.filter((a): a is RequirementArtifact => a.kind === 'requirement' && a.id === args.options.requirement && (!args.options['requirement-repository'] || a.repository?.toLowerCase() === args.options['requirement-repository'].toLowerCase()) && (!args.options['requirement-server'] || sameServer(a.repositoryServer, args.options['requirement-server'])));
    if (matches.length > 1) return fail(EXIT.usage, 'cli.requirement-ambiguous', { id: args.options.requirement });
    const requirement = matches.length === 1 ? matches[0] : undefined;
    if (!requirement) return fail(EXIT.notFound, 'cli.requirement-not-found', { id: args.options.requirement });
    const sourceFiles = workspaceFiles.filter((file) => file.path === requirement.path);
    if (sourceFiles.length !== 1) return fail(EXIT.failed, 'cli.task-create.inventory-unavailable', { repository: requirement.repository ?? '' });
    if (requirement.repositoryServer && requirement.repositoryServer.toLowerCase() !== 'github.com') return fail(EXIT.usage, 'cli.requirement-other-server', { server: requirement.repositoryServer });
    const title = args.options.title.trim();
    if (!title || /[:\n]/.test(title)) return fail(EXIT.usage, 'cli.bad-title');
    const wanted = args.options.repository ?? requirement.repository ?? '';
    const repository = repositories.find((name) => name.toLowerCase() === wanted.toLowerCase());
    if (!repository) return fail(EXIT.usage, 'cli.repository-unregistered', { repository: wanted });
    const criteria = (args.options.criteria ?? '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
    const unknown = criteria.find((c) => !requirement.criteria.some((known) => known.id === c));
    if (unknown) return fail(EXIT.usage, 'cli.unknown-criterion', { criterion: unknown, requirement: requirement.id });
    const assigneeType = args.options['assignee-type'] ?? 'agent';
    if (assigneeType !== 'human' && assigneeType !== 'agent') return fail(EXIT.usage, 'cli.bad-assignee-type');
    const checkoutSafe = async (): Promise<boolean> => {
      try {
        const origin = repositoryFromRemote((await deps.system.run('git', ['config', '--get', 'remote.origin.url'], { cwd: root })).trim());
        return !!origin && sameServer(origin.server, 'github.com') && origin.repository.toLowerCase() === repository.toLowerCase();
      } catch { return false; }
    };
    if (!(await checkoutSafe())) return fail(EXIT.failed, 'cli.task-create.checkout-unsafe', { repository });
    // The task contract of the repository (DEC-016). Without a file or a `task` section nothing changes.
    const given: Record<string, string> = {};
    for (const entry of args.repeated.field ?? []) {
      const at = entry.indexOf('=');
      if (at < 1) return fail(EXIT.usage, 'cli.bad-field');
      given[entry.slice(0, at).trim()] = entry.slice(at + 1).trim();
    }
    const [processReport] = await readProcesses(token, [repository], locale, deps.fetch as unknown as FetchFn | undefined);
    if (!processReport || processReport.file === 'failed' || processReport.issues.some((issue) => issue.severity === 'error')) {
      return fail(EXIT.failed, 'cli.task-create.process-unsafe', { repository });
    }
    const columns = processReport.process.columns;
    const initial = columns.initial ?? 'Backlog';
    const initialLabel = columns.source === 'labels' ? columns.labels[initial] : undefined;
    const initialProjection = columns.source === 'labels' && columns.projection ? columns.projection[initial] : undefined;
    const matchingBoardStatuses = Object.entries(columns.board).filter(([, column]) => column === initial).map(([status]) => status);
    const initialBoardStatus = columns.source === 'board-status' && matchingBoardStatuses.length === 1 ? matchingBoardStatuses[0] : undefined;
    if ((columns.source === 'labels' && (!initialLabel || Object.entries(columns.labels).some(([column, label]) => column !== initial && label.toLowerCase() === initialLabel.toLowerCase()) || (columns.projection !== undefined && (!initialProjection || read.read.statusOptions?.filter((option) => option === initialProjection).length !== 1)))) ||
        (columns.source === 'board-status' && (!initialBoardStatus || read.read.statusOptions?.filter((option) => option === initialBoardStatus).length !== 1))) {
      return fail(EXIT.failed, 'cli.task-create.state-unsupported', { repository });
    }
    const contract = processReport?.file === 'read' && processReport.process.task ? planTaskFields(processReport.process.task, given) : undefined;
    if (!contract && Object.keys(given).length > 0) return fail(EXIT.usage, 'cli.task-create.contract-gaps', { repository, gaps: Object.keys(given).map((field) => formatNotice({ code: 'gap.task-field-undeclared', args: { field } }, locale)) });
    if (contract && contract.gaps.length > 0) return fail(EXIT.usage, 'cli.task-create.contract-gaps', { repository, gaps: contract.gaps.map((gap) => formatNotice(gap, locale)) });
    if (contract && new Set(contract.projectFields.map((field) => field.field.toLowerCase())).size !== contract.projectFields.length) return fail(EXIT.failed, 'cli.task-create.state-unsupported', { repository });
    if (initialBoardStatus && contract?.projectFields.some((field) => field.field.toLowerCase() === 'status')) return fail(EXIT.failed, 'cli.task-create.state-unsupported', { repository });
    if (initialLabel && contract?.labels.some((label) => Object.entries(columns.labels).some(([column, status]) => column !== initial && status.toLowerCase() === label.toLowerCase()))) return fail(EXIT.failed, 'cli.task-create.state-unsupported', { repository });
    if (!workspaceComplete || read.read.membershipComplete === false) return fail(EXIT.failed, 'cli.task-create.inventory-unavailable', { repository });
    let issueTitles: string[];
    try { issueTitles = await taskIssueInventory(token, repository, deps.fetch); }
    catch { return fail(EXIT.failed, 'cli.task-create.inventory-unavailable', { repository }); }
    let used: string[];
    let pullTexts: string[];
    try { pullTexts = await taskPullInventory(token, repository, deps.fetch); used = [...artifacts.map((artifact) => artifact.id), ...read.read.cards.map((card) => card.title), ...pullTexts]; }
    catch { return fail(EXIT.failed, 'cli.task-create.inventory-unavailable', { repository }); }
    const firstTask = artifacts.find((a) => a.kind === 'task');
    const taskDirectory = firstTask ? path.posix.dirname(firstTask.path) : 'docs/tasks';
    let number = nextTaskNumber([...used, ...issueTitles]);
    let resume: Parameters<typeof planTaskCreate>[0]['resume'];
    let expectedProjection = initialProjection;
    let registrationContext: unknown;
    const resumeUrl = args.options['resume-issue'];
    if (resumeUrl) {
      const ref = parseIssueUrl(resumeUrl);
      if (!ref || `${ref.owner}/${ref.repo}`.toLowerCase() !== repository.toLowerCase()) return fail(EXIT.failed, 'cli.task-create.resume-unsafe', { repository });
      const fetched = await fetchIssue(token, resumeUrl, deps.fetch as unknown as FetchFn | undefined);
      if (!fetched.ok || fetched.issue.url.toLowerCase().replace(/\/$/, '') !== resumeUrl.toLowerCase().replace(/\/$/, '')) return fail(EXIT.failed, 'cli.task-create.resume-unsafe', { repository });
      const issue = fetched.issue;
      const match = /^\[(TASK-(\d{3,}))\] (.+)$/.exec(issue.title);
      if (!match || match[3] !== title || issue.state !== 'open' || issue.number !== ref.number) return fail(EXIT.failed, 'cli.task-create.resume-unsafe', { repository });
      number = Number(match[2]);
      const id = taskIdOf(number);
      try { issueTitles = await taskIssueInventory(token, repository, deps.fetch, { url: issue.url, title: issue.title }); }
      catch { return fail(EXIT.failed, 'cli.task-create.resume-unsafe', { repository }); }
      const sameIssue = (value: string | undefined) => value?.toLowerCase().replace(/\/$/, '') === issue.url.toLowerCase().replace(/\/$/, '');
      const localTasks = artifacts.filter((artifact) => artifact.kind === 'task' && (artifact.id === id || sameIssue(artifact.issue)));
      const localEntries = requirement.tasks.filter((task) => task.id === id || sameIssue(task.issueUrl));
      const otherReferences = artifacts.some((artifact) => artifact.kind === 'requirement' && artifact !== requirement && artifact.tasks.some((task) => task.id === id || sameIssue(task.issueUrl)));
      if (id !== match[1] || issueTitles.filter((value) => new RegExp(`^\\[${id}\\]`, 'i').test(value)).length !== 1 || otherReferences || localTasks.length > 1 || localTasks.some((task) => task.kind !== 'task' || task.id !== id || !sameIssue(task.issue) || task.requirement !== requirement.id) || localEntries.length > 1 || localEntries.some((task) => task.id !== id || !sameIssue(task.issueUrl))) return fail(EXIT.failed, 'cli.task-create.resume-unsafe', { repository });
      const localRecorded = localTasks.length > 0 || localEntries.length > 0;
      const body = await fetchIssueBody(token, repository, ref.number, deps.fetch as unknown as FetchFn | undefined).catch(() => undefined);
      const expected = `A task of ${requirement.id} (${requirement.title}). The definition is ${taskDirectory}/${id}.md.`;
      const markers = body?.match(/<!--\s*weaver-registration:[\s\S]*?-->/g) ?? [];
      const operation = taskReservationRefs(repository, requirement.id, requirement.repository, requirement.repositoryServer, title, id).operation;
      const digest = registrationIntentDigest({ repository, project: setup.project, requirement, title, criteria, assigneeType, assignee: args.options.assignee, area: args.options.area, contract, taskDirectory, process: processReport.process });
      const expectedMarker = registrationMarker(operation, id);
      const expectedIntentMarker = registrationMarker(operation, id, digest);
      const statusLabels = Object.values(columns.labels).filter((label) => issue.labels.some((actual) => actual.toLowerCase() === label.toLowerCase()));
      if (body === undefined || !body.includes(expected) || (markers.length > 0 && (markers.length !== 1 || (markers[0] !== expectedMarker && markers[0] !== expectedIntentMarker))) || (columns.source === 'labels' && statusLabels.length !== 1) || (contract?.labels ?? []).some((label) => !issue.labels.includes(label))) return fail(EXIT.failed, 'cli.task-create.resume-unsafe', { repository });
      const intentMatched = markers.length === 1 && markers[0] === expectedIntentMarker;
      if (!intentMatched) deps.err(`${say('cli.task-create.legacy-intent', { issue: issue.url })}\n`);
      const contractFields = contract?.projectFields ?? [];
      const fieldNames = [...new Set(contractFields.map((field) => field.field))];
      let observedProject = read.read;
      if (fieldNames.length) {
        const fieldsRead = await readProject(token, setup.project, [repository], deps.fetch, fieldNames);
        if (!fieldsRead.ok || fieldsRead.read.membershipComplete === false || JSON.stringify(fieldsRead.read.statusOptions ?? null) !== JSON.stringify(read.read.statusOptions ?? null)) return fail(EXIT.failed, 'cli.task-create.resume-unsafe', { repository });
        observedProject = fieldsRead.read;
      }
      const cards = observedProject.cards.filter((card) => card.url.toLowerCase().replace(/\/$/, '') === issue.url.toLowerCase().replace(/\/$/, ''));
      if (cards.length > 1 || (cards.length === 1 && (!cards[0].projectItemId || (columns.source === 'board-status' && (!cards[0].boardStatusRead || (cards[0].boardStatus !== undefined && !columns.board[cards[0].boardStatus])))))) return fail(EXIT.failed, 'cli.task-create.resume-unsafe', { repository });
      if (columns.source === 'labels' && columns.projection) {
        const mappedColumn = Object.entries(columns.labels).find(([, label]) => label.toLowerCase() === statusLabels[0]?.toLowerCase())?.[0] as keyof typeof columns.labels | undefined;
        expectedProjection = mappedColumn ? columns.projection[mappedColumn] : undefined;
        if (!expectedProjection || read.read.statusOptions?.filter((option) => option === expectedProjection).length !== 1 || (cards.length === 1 && (!cards[0].boardStatusRead || cards[0].boardStatus !== expectedProjection))) return fail(EXIT.failed, 'cli.task-create.projection-unverified', { repository });
      }
      const needsInitialStatus = columns.source === 'board-status' && cards.length === 1 && cards[0].boardStatus === undefined;
      if (cards.length === 1 && contractFields.some((field) => cards[0].fieldsRead?.[field.field] !== true || (cards[0].fields?.[field.field] !== undefined && cards[0].fields?.[field.field] !== field.value))) return fail(EXIT.failed, 'cli.task-create.resume-unsafe', { repository });
      const pendingProjectFields = cards.length === 1 ? contractFields.filter((field) => cards[0].fields?.[field.field] === undefined).map((field) => field.field) : [];
      let statusRestored = false;
      const restoredFields = new Set<string>();
      const revalidate = async () => {
        if (!(await checkoutSafe())) return false;
        const current = await fetchIssue(token, issue.url, deps.fetch as unknown as FetchFn | undefined);
        const currentBody = await fetchIssueBody(token, repository, ref.number, deps.fetch as unknown as FetchFn | undefined).catch(() => undefined);
        if (!current.ok || current.issue.title !== issue.title || current.issue.state !== issue.state || JSON.stringify([...current.issue.labels].sort()) !== JSON.stringify([...issue.labels].sort()) || currentBody !== body) return false;
        let currentTitles: string[];
        try { currentTitles = await taskIssueInventory(token, repository, deps.fetch, { url: issue.url, title: issue.title }); } catch { return false; }
        if (currentTitles.filter((value) => new RegExp(`^\\[${id}\\]`, 'i').test(value)).length !== 1) return false;
        if (cards.length === 1) {
          const currentProject = await readProject(token, setup.project, [repository], deps.fetch, fieldNames);
          if (!currentProject.ok || currentProject.read.membershipComplete === false) return false;
          const currentCards = currentProject.read.cards.filter((card) => card.url.toLowerCase().replace(/\/$/, '') === issue.url.toLowerCase().replace(/\/$/, ''));
          const expectedStatus = statusRestored ? initialBoardStatus : cards[0].boardStatus;
          if (currentCards.length !== 1 || currentCards[0].projectItemId !== cards[0].projectItemId || currentCards[0].boardStatus !== expectedStatus || currentCards[0].boardStatusRead !== cards[0].boardStatusRead) return false;
          if (contractFields.some((field) => currentCards[0].fieldsRead?.[field.field] !== true || currentCards[0].fields?.[field.field] !== (restoredFields.has(field.field) ? field.value : cards[0].fields?.[field.field]))) return false;
        }
        return true;
      };
      resume = { number: ref.number, url: issue.url, item: cards[0]?.projectItemId, needsInitialStatus, pendingProjectFields, onStatusRestored: () => { statusRestored = true; }, onFieldRestored: (field) => { restoredFields.add(field); }, revalidate };
      registrationContext = { observedAt: deps.now().toISOString(), task: id, issue: { url: issue.url, state: issue.state, labels: issue.labels, source: 'github', intent: intentMatched ? 'matched' : 'unverified' }, project: { ...setup.project, membership: cards.length ? 'observed' : 'absent', item: cards[0]?.projectItemId ?? null, status: cards[0]?.boardStatus ?? null }, columnSource: columns.source, files: 'unverified' };
      const relatedPulls = Array.from({ length: pullTexts.length / 2 }, (_, index) => pullTexts.slice(index * 2, index * 2 + 2)).filter((pair) => pair.some((value) => value.toLowerCase().includes(id.toLowerCase())));
      if (relatedPulls.length > 0) {
        if (relatedPulls.length !== 1 || cards.length !== 1 || !(await revalidate())) return fail(EXIT.failed, 'cli.task-create.resume-unsafe', { repository });
        try {
          const top = (await deps.system.run('git', ['rev-parse', '--show-toplevel'], { cwd: root })).trim();
          const taskPath = path.relative(top, path.resolve(root, taskDirectory, `${id}.md`)).split(path.sep).join('/');
          const requirementPath = path.relative(top, path.resolve(root, requirement.path)).split(path.sep).join('/');
          if ([taskPath, requirementPath].some((value) => value.startsWith('../') || value === '..' || path.posix.isAbsolute(value) || path.win32.isAbsolute(value))) throw new Error('Path outside repository');
          const expectedTask = renderTaskFile({ id, title, requirement: requirement.id, ...(requirement.repository && (requirement.repository.toLowerCase() !== repository.toLowerCase() || requirement.repositoryServer) ? { requirementRepository: requirement.repository } : {}), ...(requirement.repository && requirement.repositoryServer ? { requirementServer: requirement.repositoryServer } : {}), issueUrl: issue.url, issueNumber: ref.number, repository, criteria, assigneeType, assignee: args.options.assignee, fileFields: contract?.fileFields, sections: contract?.sections });
          const check = { token, repository, branch: `docs/${id.toLowerCase()}-${slugOf(title)}`, taskId: id, taskPath, requirementPath, expectedTask, expectedRequirementLine: taskListLine(id, title, ref.number, issue.url), fetch: deps.fetch };
          const merged = await observeMergedTaskPull(check).catch(() => undefined);
          const restoreFields = async (observedPull: object, rereadPull: () => Promise<object>, filesState: string): Promise<number> => {
            const actions = planTaskCreate({ token, login: await deps.login(), locale, project: setup.project, requirement, repository, title, criteria, assigneeType, assignee: args.options.assignee, area: args.options.area, initialLabel, initialBoardStatus, initialBoardProjection: expectedProjection, contract, number, taskDirectory, resume, approvalProcess: processReport.process, root, system: deps.system, fetch: deps.fetch, revalidateProcess: async () => {
              const [current] = await readProcesses(token, [repository], locale, deps.fetch as unknown as FetchFn | undefined);
              return !!current && current.file === processReport.file && !current.issues.some((item) => item.severity === 'error') && JSON.stringify(current.process) === JSON.stringify(processReport.process);
            } });
            const fieldActions = actions.filter((item) => item.kind === 'project.field');
            if (!fieldActions.length) throw new Error('Field action unavailable');
            for (const action of fieldActions) {
              action.fingerprint = `${action.fingerprint ?? ''}\n${JSON.stringify(observedPull)}`;
              const apply = action.run;
              action.run = async () => {
                if (JSON.stringify(await rereadPull()) !== JSON.stringify(observedPull)) throw new Error(say('cli.task-create.resume-unsafe', { repository }));
                const result = await apply();
                if (JSON.stringify(await rereadPull()) !== JSON.stringify(observedPull) || !(await revalidate())) throw new Error(say('cli.task-create.resume-unsafe', { repository }));
                return result;
              };
            }
            const context = { ...(registrationContext as object), files: filesState, pullRequest: { ...observedPull, source: 'github' } };
            return confirmAndRun(fieldActions, [], { registration: true, registrationRecheck: true, context });
          };
          if (merged) {
            const [currentProcess] = await readProcesses(token, [repository], locale, deps.fetch as unknown as FetchFn | undefined);
            if (!currentProcess || currentProcess.file !== processReport.file || currentProcess.issues.some((item) => item.severity === 'error') || JSON.stringify(currentProcess.process) !== JSON.stringify(processReport.process) || !(await revalidate())) throw new Error('Registration changed');
            if (needsInitialStatus || pendingProjectFields.length) return await restoreFields(merged, () => observeMergedTaskPull(check), 'merged');
            const context = { ...(registrationContext as object), files: 'merged', pullRequest: { ...merged, source: 'github' } };
            return finishActions([], deps, locale, wantsText, { registration: true, verifiedRegistration: true, context });
          }
          if (localRecorded) throw new Error('Local task already exists');
          const pull = await observeExistingTaskPull(check);
          if (needsInitialStatus || pendingProjectFields.length) return await restoreFields(pull, () => observeExistingTaskPull(check), 'proposed');
          const context = { ...(registrationContext as object), files: 'proposed', pullRequest: { ...pull, source: 'github' } };
          return finishActions([], deps, locale, wantsText, { registration: true, existingPull: true, context });
        } catch { return fail(EXIT.failed, 'cli.task-create.resume-unsafe', { repository }); }
      }
      if (localRecorded) return fail(EXIT.failed, 'cli.task-create.resume-unsafe', { repository });
      if (cards.length === 1) {
        const branch = `docs/${id.toLowerCase()}-${slugOf(title)}`;
        try {
          const inspectBranch = async () => (await deps.system.run('git', ['ls-remote', '--heads', `https://github.com/${repository}.git`, `refs/heads/${branch}`])).trim();
          const observedBranch = await inspectBranch();
          if (observedBranch) {
            const matchBranch = /^([a-f0-9]{40})\s+(.+)$/i.exec(observedBranch);
            if (!matchBranch || matchBranch[2] !== `refs/heads/${branch}` || !(await revalidate())) throw new Error('Branch identity uncertain');
            const head = matchBranch[1];
            const top = (await deps.system.run('git', ['rev-parse', '--show-toplevel'], { cwd: root })).trim();
            const taskPath = path.relative(top, path.resolve(root, taskDirectory, `${id}.md`)).split(path.sep).join('/');
            const requirementPath = path.relative(top, path.resolve(root, requirement.path)).split(path.sep).join('/');
            if ([taskPath, requirementPath].some((value) => value.startsWith('../') || value === '..' || path.posix.isAbsolute(value) || path.win32.isAbsolute(value))) throw new Error('Path outside repository');
            const expectedTask = renderTaskFile({ id, title, requirement: requirement.id, ...(requirement.repository && (requirement.repository.toLowerCase() !== repository.toLowerCase() || requirement.repositoryServer) ? { requirementRepository: requirement.repository } : {}), ...(requirement.repository && requirement.repositoryServer ? { requirementServer: requirement.repositoryServer } : {}), issueUrl: issue.url, issueNumber: ref.number, repository, criteria, assigneeType, assignee: args.options.assignee, fileFields: contract?.fileFields, sections: contract?.sections });
            const check = { token, repository, branch, taskId: id, taskPath, requirementPath, expectedTask, expectedRequirementLine: taskListLine(id, title, ref.number, issue.url), fetch: deps.fetch };
            await verifyTaskFiles(check, head);
            if (await inspectBranch() !== observedBranch) throw new Error('Branch changed');
            if (needsInitialStatus || pendingProjectFields.length) {
              const actions = planTaskCreate({ token, login: await deps.login(), locale, project: setup.project, requirement, repository, title, criteria, assigneeType, assignee: args.options.assignee, area: args.options.area, initialLabel, initialBoardStatus, initialBoardProjection: expectedProjection, contract, number, taskDirectory, resume, approvalProcess: processReport.process, root, system: deps.system, fetch: deps.fetch, revalidateProcess: async () => {
                const [current] = await readProcesses(token, [repository], locale, deps.fetch as unknown as FetchFn | undefined);
                return !!current && current.file === processReport.file && !current.issues.some((item) => item.severity === 'error') && JSON.stringify(current.process) === JSON.stringify(processReport.process);
              } });
              const fieldActions = actions.filter((item) => item.kind === 'project.field');
              if (!fieldActions.length) throw new Error('Field action unavailable');
              const verifyBranch = async () => {
                if (await inspectBranch() !== observedBranch) throw new Error('Branch changed');
                const pulls = await taskPullInventory(token, repository, deps.fetch);
                if (pulls.some((value) => value.toLowerCase().includes(id.toLowerCase()))) throw new Error('Pull request appeared');
                await verifyTaskFiles(check, head);
              };
              for (const action of fieldActions) {
                action.fingerprint = `${action.fingerprint ?? ''}\n${JSON.stringify({ branch, head, fields: cards[0].fields, status: cards[0].boardStatus ?? null })}`;
                const apply = action.run;
                action.run = async () => {
                  await verifyBranch();
                  const result = await apply();
                  await verifyBranch();
                  if (!(await revalidate())) throw new Error(say('cli.task-create.resume-unsafe', { repository }));
                  return result;
                };
              }
              const context = { ...(registrationContext as object), files: 'branch-observed', branch: { name: branch, head } };
              return await confirmAndRun(fieldActions, [], { registration: true, registrationRecheck: true, context });
            }
            const base = (await deps.system.run('gh', ['repo', 'view', repository, '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'])).trim();
            if (!base) throw new Error('Default branch unavailable');
            const actor = await deps.login();
            const reservation = `refs/heads/weaver/reservations/recover-pr-${id.toLowerCase()}`;
            const action: PlannedAction = {
              kind: 'files.pull-request', target: `${repository} ${branch} ${issue.url}`,
              identifiers: { task: id, issue: issue.url, projectItem: cards[0].projectItemId as string, branch, head, recoveryReservation: reservation },
              fingerprint: JSON.stringify({ repository, branch, head, base, issue: issue.url, item: cards[0].projectItemId, process: processReport.process, task: expectedTask, requirementLine: check.expectedRequirementLine, reservation }),
              summary: { code: 'cli.task-create.recover-branch', args: { repository, branch, head, base, reservation } },
              reason: { code: 'cli.task-create.resume-reason' },
              run: async () => {
                const [currentProcess] = await readProcesses(token, [repository], locale, deps.fetch as unknown as FetchFn | undefined);
                if (!currentProcess || currentProcess.file !== processReport.file || currentProcess.issues.some((item) => item.severity === 'error') || JSON.stringify(currentProcess.process) !== JSON.stringify(processReport.process) || !(await revalidate())) throw new Error(say('cli.task-create.resume-unsafe', { repository }));
                try { await reserveRecovery(token, repository, reservation, head, deps.fetch); }
                catch { throw new Error(say('cli.task-create.recovery-reservation-unsafe', { reservation })); }
                const currentPulls = await taskPullInventory(token, repository, deps.fetch);
                if (currentPulls.some((value) => value.toLowerCase().includes(id.toLowerCase())) || await inspectBranch() !== observedBranch) throw new Error(say('cli.task-create.resume-unsafe', { repository }));
                await verifyTaskFiles(check, head);
                const currentBase = (await deps.system.run('gh', ['repo', 'view', repository, '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'])).trim();
                const [lastProcess] = await readProcesses(token, [repository], locale, deps.fetch as unknown as FetchFn | undefined);
                if (currentBase !== base || !lastProcess || lastProcess.file !== processReport.file || lastProcess.issues.some((item) => item.severity === 'error') || JSON.stringify(lastProcess.process) !== JSON.stringify(processReport.process) || !(await revalidate())) throw new Error(say('cli.task-create.resume-unsafe', { repository }));
                let pull: string;
                try { pull = (await deps.system.run('gh', ['pr', 'create', '--repo', repository, '--head', branch, '--base', base, '--title', `docs: add ${id} ${title}`, '--body', `${attribution(locale, actor)}\n\nAdds ${taskPath} and lists ${id} under ${requirement.id}. Issue: ${issue.url}`])).trim(); }
                catch (error) { throw new NoticeError({ code: 'cli.task-create.files-write-uncertain', args: { branch, detail: error instanceof Error ? error.message : String(error) } }); }
                action.identifiers = { ...action.identifiers, pullRequest: pull };
                const verified = await observeExistingTaskPull(check);
                if (verified.url !== pull || verified.head !== head) throw new Error(say('cli.task-create.pr-unverified', { pull }));
                return { identifiers: { pullRequest: pull } };
              },
            };
            const context = { ...(registrationContext as object), files: 'branch-observed', branch: { name: branch, head } };
            return confirmAndRun([action], [], { registration: true, context });
          }
        } catch { return fail(EXIT.failed, 'cli.task-create.resume-unsafe', { repository }); }
      }
    } else if (hasTaskTitleCandidate(issueTitles, title)) {
      const operation = taskReservationRefs(repository, requirement.id, requirement.repository, requirement.repositoryServer, title, taskIdOf(number)).operation;
      let candidates;
      try { candidates = await taskIssueCandidates(token, repository, title, operation, deps.fetch); }
      catch { return fail(EXIT.failed, 'cli.task-create.inventory-unavailable', { repository }); }
      if (candidates.length === 0) return fail(EXIT.failed, 'cli.task-create.inventory-unavailable', { repository });
      const message = say('cli.task-create.candidates', { repository, candidates: candidates.map((candidate) => `${candidate.task}: ${candidate.url}`).join(', ') });
      report('cli.task-create.identity-ambiguous', message, { candidates });
      return EXIT.failed;
    } else {
      const operation = taskReservationRefs(repository, requirement.id, requirement.repository, requirement.repositoryServer, title, taskIdOf(number)).operation;
      let visible: boolean;
      try { visible = await operationReservationVisible(token, repository, operation, deps.fetch); }
      catch { return fail(EXIT.failed, 'cli.task-create.inventory-unavailable', { repository }); }
      if (visible) return fail(EXIT.failed, 'cli.task-create.operation-reserved', { repository, operation });
    }
    const actions = planTaskCreate({
      token,
      login: await deps.login(),
      locale,
      project: setup.project,
      requirement,
      requirementText: sourceFiles[0].text,
      repository,
      title,
      criteria,
      assigneeType,
      assignee: args.options.assignee,
      area: args.options.area,
      initialLabel,
      initialBoardStatus,
      initialBoardProjection: expectedProjection,
      contract,
      number,
      taskDirectory,
      resume,
      approvalProcess: processReport.process,
      root,
      system: deps.system,
      fetch: deps.fetch,
      wait: deps.wait,
      revalidateCheckout: checkoutSafe,
      revalidateProcess: async () => {
        const [current] = await readProcesses(token, [repository], locale, deps.fetch as unknown as FetchFn | undefined);
        return !!current && current.file === processReport.file && !current.issues.some((issue) => issue.severity === 'error') && JSON.stringify(current.process) === JSON.stringify(processReport.process);
      },
    });
    return confirmAndRun(actions, [], { registration: true, context: registrationContext });
  }

  // How each repository tracks its work (DEC-015). One without a file, or whose file cannot be read,
  // keeps today's defaults, and the person is told about the one that could not be read.
  const processes = new Map(
    (await readProcesses(token, repositories, locale, deps.fetch as unknown as FetchFn | undefined, setup.guideline)).map((r) => [r.repository.toLowerCase(), r] as const),
  );
  for (const r of processes.values()) {
    if (r.file === 'failed') deps.err(`${formatNotice({ code: 'cli.process-unreadable', args: { repository: r.repository, detail: r.error?.message ?? '' } }, locale)}\n`);
  }
  const rulesFor = (repository: string) => {
    const found = processes.get(repository.toLowerCase());
    return found && found.file !== 'failed' && !found.issues.some((issue) => issue.severity === 'error') ? found.process.columns : undefined;
  };
  const idleDaysFor = (repository: string) => {
    const found = processes.get(repository.toLowerCase());
    return found?.file === 'read' ? found.process.stale.idleDays : DEFAULT_STALE_DAYS;
  };
  const evidenceFor = (repository: string) => {
    const found = processes.get(repository.toLowerCase());
    return found?.file === 'read' ? found.process.evidence : undefined;
  };
  const contractFor = (repository: string) => {
    const found = processes.get(repository.toLowerCase());
    return found?.file === 'read' ? found.process.task : undefined;
  };
  // A contract field that lives in a Project field can be compared only when that field is read (DEC-016 item 5).
  const projectFields = [...new Set(repositories.flatMap((name) => contractFor(name)?.fields.flatMap((f) => (f.projectField ? [f.projectField] : [])) ?? []))];
  let boardRead = read.read;
  if (args.command === 'reconcile' && projectFields.length > 0) {
    const again = await readProject(token, setup.project, setup.repositories?.map((r) => r.repository), deps.fetch, projectFields);
    if (!again.ok) {
      report(again.error.code, formatNotice(again.error, locale));
      return EXIT.failed;
    }
    boardRead = again.read;
  }
  const cards = placeWithRules(boardRead.cards, rulesFor);
  const all = toCliCards(cards, artifacts, deps.now(), idleDaysFor, evidenceFor);

  if (args.command === 'reconcile') {
    const setupUnchanged = async () => {
      const current = await loadSetup(root, deps, locale);
      return current.ok && current.setup.project.owner.toLowerCase() === setup.project.owner.toLowerCase() && current.setup.project.number === setup.project.number && JSON.stringify(current.setup.repositories ?? null) === JSON.stringify(setup.repositories ?? null);
    };
    const merged = await Promise.all(repositories.map((repository) => readMergedPulls(token, repository, 50, deps.fetch)));
    const plan = await planReconcile({
      token,
      login: await deps.login(),
      locale,
      project: setup.project,
      repositories,
      cards,
      ...(boardRead.statusOptions !== undefined ? { statusOptions: boardRead.statusOptions } : {}),
      projectMembershipComplete: boardRead.membershipComplete,
      workspaceComplete,
      unavailableRepositories: repositories.filter((name) => { const report = processes.get(name.toLowerCase()); return !report || report.file === 'failed' || report.issues.some((issue) => issue.severity === 'error'); }),
      rulesFor,
      freshSetupMatches: setupUnchanged,
      freshTaskIssue: async (taskPath) => {
        const latest = loadWorkspace(await deps.files(root)).artifacts.find((artifact) => artifact.kind === 'task' && artifact.path === taskPath);
        return latest?.kind === 'task' ? latest.issue : undefined;
      },
      freshRulesFor: async (repository) => {
        const [fresh] = await readProcesses(token, [repository], locale, deps.fetch as unknown as FetchFn | undefined, setup.guideline);
        if (!fresh || fresh.file === 'failed' || fresh.issues.some((issue) => issue.severity === 'error')) return undefined;
        return fresh.process.columns;
      },
      idleDaysFor,
      evidenceFor,
      contractFor,
      files: {
        token,
        login: await deps.login(),
        locale,
        project: setup.project,
        system: deps.system,
        root,
        taskDirectory: (() => {
          const first = artifacts.find((a) => a.kind === 'task');
          return first ? path.posix.dirname(first.path) : 'docs/tasks';
        })(),
        fetch: deps.fetch,
        fetchFn: deps.fetch as unknown as FetchFn | undefined,
        usedTexts: (repository) => usedTaskTexts(artifacts, cards, repository, deps.system),
        planned: [],
      },
      artifacts,
      pulls: merged.flatMap((r) => (r.ok ? r.pulls : [])),
      now: deps.now(),
      fetch: deps.fetch,
      fetchFn: deps.fetch as unknown as FetchFn | undefined,
    });
    // Without --apply (or --approve) this only shows the plan, even at a terminal.
    const dryRun = !args.flags.has('apply') && !args.options.approve;
    const context = {
      project: setup.project,
      statusOptions: boardRead.statusOptions ?? null,
      incompletePullRepositories: merged.flatMap((result, index) => result.ok && !result.incomplete ? [] : [repositories[index]]),
      repositories: repositories.map((repository) => {
        const report = processes.get(repository.toLowerCase());
        const rules = !report || report.file === 'failed' || report.issues.some((issue) => issue.severity === 'error') ? undefined : report.process.columns;
        return { repository, file: report?.file ?? 'failed', columnsSource: report?.sources.columns ?? 'unknown', rules: rules ?? null, projectionOrigin: rules?.source === 'labels' ? (rules.projection ? 'repository' : 'legacy-default') : null, projection: rules?.source === 'labels' ? (rules.projection ?? PROJECT_STATUS_FOR_COLUMN) : null, issues: report?.issues ?? [] };
      }),
    };
    const initial = findMismatches({ artifacts, cards, repositories, projectMembershipComplete: boardRead.membershipComplete, workspaceComplete, pulls: merged.flatMap((r) => r.ok ? r.pulls : []), rulesFor, boardSourced: repositories.filter((name) => rulesFor(name)?.source === 'board-status'), contractFor });
    const recheck = async () => {
      if (!await setupUnchanged()) return { status: 'incomplete', reason: t('cli.reconcile.recheck-setup-changed', locale) };
      let refreshedArtifacts: Artifact[];
      try {
        const refreshed = loadWorkspace(await deps.files(root));
        refreshedArtifacts = refreshed.artifacts;
        if (refreshed.issues.some((issue) => issue.severity === 'error' && !refreshedArtifacts.some((artifact) => artifact.path === issue.path))) return { status: 'incomplete', reason: t('cli.reconcile.recheck-artifact-invalid', locale) };
      } catch {
        return { status: 'unavailable', reason: t('cli.reconcile.recheck-files', locale) };
      }
      const latest = await readProject(token, setup.project, setup.repositories?.map((r) => r.repository), deps.fetch, projectFields);
      if (!latest.ok) return { status: 'unavailable', reason: formatNotice(latest.error, locale) };
      const latestProcesses = await readProcesses(token, repositories, locale, deps.fetch as unknown as FetchFn | undefined, setup.guideline);
      const failed = latestProcesses.filter((r) => r.file === 'failed' || r.issues.some((issue) => issue.severity === 'error'));
      if (failed.length) return { status: 'incomplete', reason: failed.map((r) => r.repository) };
      const latestFields = [...new Set(latestProcesses.flatMap((r) => r.process.task?.fields.flatMap((field) => field.projectField ? [field.projectField] : []) ?? []))];
      if (JSON.stringify([...latestFields].sort()) !== JSON.stringify([...projectFields].sort())) return { status: 'incomplete', reason: t('cli.reconcile.recheck-fields-changed', locale) };
      if (latestProcesses.some((current) => { const before = processes.get(current.repository.toLowerCase()); return !before || before.file !== current.file || JSON.stringify(before.process) !== JSON.stringify(current.process); })) return { status: 'incomplete', reason: t('cli.reconcile.recheck-process-changed', locale) };
      const processByRepo = new Map(latestProcesses.map((r) => [r.repository.toLowerCase(), r]));
      const currentRules = (repository: string) => processByRepo.get(repository.toLowerCase())?.process.columns;
      const currentContract = (repository: string) => processByRepo.get(repository.toLowerCase())?.process.task;
      const latestPulls = await Promise.all(repositories.map((repository) => readMergedPulls(token, repository, 50, deps.fetch)));
      const missingPulls = latestPulls.flatMap((result, index) => result.ok && !result.incomplete ? [] : [repositories[index]]);
      const current = findMismatches({ artifacts: refreshedArtifacts, cards: placeWithRules(latest.read.cards, currentRules), repositories, projectMembershipComplete: latest.read.membershipComplete, pulls: latestPulls.flatMap((r) => r.ok ? r.pulls : []), rulesFor: currentRules, boardSourced: repositories.filter((name) => currentRules(name)?.source === 'board-status'), contractFor: currentContract });
      const key = (m: { kind: string; subject: string; path?: string; url?: string }) => JSON.stringify([m.kind, m.subject, m.path ?? null, m.url ?? null]);
      const currentKeys = new Set(current.map(key));
      const show = (m: typeof current[number]) => ({ kind: m.kind, subject: m.subject, message: formatNotice({ code: `mismatch.${m.kind}` as MessageKey, args: m.args }, locale), ...(m.url ? { url: m.url } : {}) });
      const incomplete = missingPulls.length > 0 || latest.read.membershipComplete === false || latest.read.statusOptions === undefined || latest.read.cards.some((card) => card.pullsIncomplete || card.boardStatusRead !== true);
      const statusKinds = new Set(['board-status-differs', 'board-status-missing', 'board-status-unread', 'projection-unmapped', 'status-source-needs-decision']);
      const stillHasStatusGap = (m: typeof initial[number]) => statusKinds.has(m.kind) && current.some((now) => statusKinds.has(now.kind) && now.url === m.url);
      return { status: incomplete ? 'incomplete' : 'read', resolved: initial.filter((m) => !currentKeys.has(key(m)) && !stillHasStatusGap(m) && (m.kind !== 'merged-pr-not-linked' || missingPulls.length === 0) && (m.kind !== 'issue-not-on-project' || latest.read.membershipComplete !== false) && (!statusKinds.has(m.kind) || (latest.read.statusOptions !== undefined && latest.read.cards.find((card) => card.url === m.url)?.boardStatusRead === true))).map(show), remaining: current.map(show), ...(missingPulls.length ? { unavailablePullRepositories: missingPulls } : {}) };
    };
    return confirmAndRun(plan.actions, [], { report: plan.reports, dryRun, context, recheck });
  }

  if (args.command === 'evidence' && args.positional[0] === 'inspect') {
    const requested = args.positional[1];
    const matchingTasks = artifacts.filter((artifact) => artifact.kind === 'task' && (artifact.id.toLowerCase() === requested.toLowerCase() || (artifact.issue && normalizeIssueUrl(artifact.issue) === normalizeIssueUrl(requested))));
    if (/^TASK-\d+$/i.test(requested) && matchingTasks.length > 1) return fail(EXIT.usage, 'cli.ambiguous', { ref: requested, matches: matchingTasks.map((task) => task.path) });
    const requestedCard = findCards(all, requested);
    if (requestedCard.length > 1) return fail(EXIT.usage, 'cli.ambiguous', { ref: requested, matches: requestedCard.map((card) => `${card.repository}#${card.number}`) });
    const direct = parseIssueUrl(requested) ? requested : undefined;
    const issueUrl = matchingTasks[0]?.kind === 'task' ? matchingTasks[0].issue : requestedCard[0]?.url ?? direct;
    if (!issueUrl) return fail(EXIT.notFound, 'cli.not-found', { ref: requested });
    const issueRef = parseIssueUrl(issueUrl);
    if (!issueRef || !repositories.some((repository) => repository.toLowerCase() === `${issueRef.owner}/${issueRef.repo}`.toLowerCase())) return fail(EXIT.notFound, 'cli.not-found', { ref: requested });
    const linked = artifacts.filter((artifact) => artifact.kind === 'task' && artifact.issue && normalizeIssueUrl(artifact.issue) === normalizeIssueUrl(issueUrl));
    const projectCard = cards.find((card) => normalizeIssueUrl(card.url) === normalizeIssueUrl(issueUrl));
    const repository = `${issueRef.owner}/${issueRef.repo}`;
    const process = processes.get(repository.toLowerCase());
    const usableProcess = process && process.file !== 'failed' && !process.issues.some((item) => item.severity === 'error');
    const [observed, mergedInventory] = await Promise.all([
      fetchCompletionEvidence(token, issueUrl, deps.now(), deps.fetch as unknown as FetchFn | undefined),
      readMergedPulls(token, repository, 50, deps.fetch),
    ]);
    const findings: { kind: string; message: string; url: string }[] = [];
    const finding = (kind: string, key: MessageKey, url: string) => findings.push({ kind, message: say(key), url });
    if (!observed.issue.ok) finding('issue-unavailable', 'cli.evidence-inspect.issue-unavailable', issueUrl);
    if (observed.pulls.status === 'unavailable') finding('pulls-unavailable', 'cli.evidence-inspect.pulls-unavailable', issueUrl);
    else {
      if (observed.pulls.value.length === 0) finding('no-referenced-pr', 'cli.evidence-inspect.no-pr', issueUrl);
      for (const pull of observed.pulls.value) {
        if (pull.state === 'merged' && pull.link === 'mentions') finding('merged-not-closing', 'cli.evidence-inspect.non-closing', pull.url);
        if (pull.link === 'unknown') finding('closing-unavailable', 'cli.evidence-inspect.closing-unavailable', pull.url);
        if (pull.checks === 'none') finding('no-checks', 'cli.evidence-inspect.no-checks', pull.url);
        if (pull.checks === 'unknown') finding('checks-inconclusive', 'cli.evidence-inspect.checks-inconclusive', pull.url);
      }
    }
    if (observed.comments.status === 'unavailable') finding('comments-unavailable', 'cli.evidence-inspect.comments-unavailable', issueUrl);
    for (const entry of observed.reviews ?? []) {
      if (entry.observation.status === 'unavailable') finding('reviews-unavailable', 'cli.evidence-inspect.reviews-unavailable', entry.pullUrl);
      else if (entry.observation.value.length === 0) finding('no-formal-review', 'cli.evidence-inspect.no-review', entry.pullUrl);
    }
    if (!usableProcess) finding('process-unavailable', 'cli.evidence-inspect.process-unavailable', issueUrl);
    if (linked.length > 1) finding('shared-issue', 'cli.evidence-inspect.shared', issueUrl);
    if (!mergedInventory.ok || mergedInventory.incomplete) finding('merged-inventory-incomplete', 'cli.evidence-inspect.inventory-incomplete', issueUrl);
    const discovered = mergedInventory.ok ? mergedInventory.pulls.filter((pull) => pull.closes.includes(issueRef.number) || linked.some((task) => task.kind === 'task' && taskIdsOfPull(pull).includes(task.id))) : [];
    const referencedUrls = new Set(observed.pulls.status === 'read' ? observed.pulls.value.map((pull) => pull.url.toLowerCase()) : []);
    for (const pull of discovered) if (!referencedUrls.has(pull.url.toLowerCase())) finding('other-merged-pr', 'cli.evidence-inspect.other-pr', pull.url);
    const detail = {
      schema: SCHEMA,
      project: setup.project,
      membership: projectCard ? 'present' : boardRead.membershipComplete === true ? 'absent' : 'unknown',
      placement: projectCard && usableProcess ? { column: projectCard.placement.column, gaps: projectCard.placement.gaps, labels: projectCard.labels, boardStatus: projectCard.boardStatus ?? null, boardStatusRead: projectCard.boardStatusRead === true } : null,
      process: usableProcess ? { file: process.file, sources: process.sources, columns: process.process.columns, evidence: process.process.evidence } : null,
      tasks: linked.map((task) => task.kind === 'task' ? { id: task.id, path: task.path, testClaim: task.tests ?? null, evidenceException: task.evidenceException ?? null, exceptionHonored: usableProcess ? Boolean(honoredException(task.evidenceException, process.process.evidence)) : null } : null),
      sharedIssue: linked.length > 1,
      independentTests: 'unverified',
      observation: observed,
      mergedInventory: mergedInventory.ok ? { status: mergedInventory.incomplete ? 'incomplete' : 'read', pulls: discovered } : { status: 'unavailable', error: mergedInventory.error },
      findings,
      guidance: say('cli.evidence-inspect.guidance'),
    };
    if (wantsText) deps.out(`${say('cli.evidence-inspect.heading')}\n${JSON.stringify(detail, null, 2)}\n`);
    else deps.out(`${JSON.stringify(detail)}\n`);
    return EXIT.ok;
  }

  if (args.command === 'card' || args.command === 'evidence') {
    const ref = args.positional[1];
    const matches = findCards(all, ref);
    if (matches.length === 0) return fail(EXIT.notFound, 'cli.not-found', { ref });
    if (matches.length > 1) return fail(EXIT.usage, 'cli.ambiguous', { ref, matches: matches.map((c) => `${c.repository}#${c.number}`) });
    const card = matches[0];
    const fetchFn = deps.fetch as unknown as FetchFn | undefined;
    let planned;
    if (args.command === 'card') {
      const column = parseColumn(args.options.to);
      if (!column) return fail(EXIT.usage, 'cli.bad-column', { column: args.options.to });
      const task = card.task?.path ? artifacts.find((a) => a.kind === 'task' && a.path === card.task?.path) : undefined;
      planned = await planCardMove({ token, card, column, evidenceException: task?.kind === 'task' && Boolean(honoredException(task.evidenceException, evidenceFor(card.repository))), locale, rules: rulesFor(card.repository), evidence: evidenceFor(card.repository), fetchFn });
    } else {
      planned = await planEvidenceAttach({ token, login: await deps.login(), card, pull: args.options.pull, locale, fetchFn });
    }
    if (!planned.ok) return fail(EXIT.usage, planned.refusal.code, planned.refusal.args);
    return confirmAndRun(planned.actions);
  }

  if (args.command === 'list') {
    const repository = args.options.repository?.toLowerCase();
    const column = args.options.column?.toLowerCase();
    const cards = all.filter((c) => (!repository || c.repository.toLowerCase() === repository) && (!column || c.column.toLowerCase() === column));
    if (wantsText) {
      deps.out(cards.map(textLine).join('\n') + (cards.length ? '\n' : ''));
      // A file outside the folder that changes which Project is read is never silent (DEC-018 item 9).
      if (setup.source !== 'user' && setup.decidedBy) deps.err(`${formatNotice({ code: 'cli.config-decided', args: { file: setup.decidedBy, source: setup.source } }, locale)}\n`);
    } else {
      const project = { owner: setup.project.owner, number: setup.project.number, title: read.read.title };
      deps.out(`${JSON.stringify({ schema: SCHEMA, project, config: configOf(setup), repositories: repositorySummaries(repositories, processes), cards, skipped: read.read.skipped })}\n`);
    }
    return EXIT.ok;
  }

  const ref = args.positional[0];
  const matches = findCards(all, ref);
  if (matches.length === 0) return fail(EXIT.notFound, 'cli.not-found', { ref });
  if (matches.length > 1) return fail(EXIT.usage, 'cli.ambiguous', { ref, matches: matches.map((c) => `${c.repository}#${c.number}`) });
  const card = matches[0];

  const task = card.task?.path ? artifacts.find((a) => a.kind === 'task' && a.path === card.task?.path) : undefined;
  const requirement = card.requirement ? artifacts.find((a) => a.kind === 'requirement' && a.path === card.requirement?.path) : undefined;
  const merged = await readMergedPulls(token, card.repository, 50, deps.fetch);
  const pulls = merged.ok
    ? merged.pulls
        .filter(
          (pull) =>
            pull.repository.toLowerCase() === card.repository.toLowerCase() &&
            (pull.closes.includes(card.number) || (card.task !== undefined && taskIdsOfPull(pull).includes(card.task.id))),
        )
        .map((pull) => ({ number: pull.number, title: pull.title, url: pull.url, closes: pull.closes.includes(card.number) }))
    : null;
  const warnings = merged.ok ? [] : [formatNotice(merged.error, locale)];

  const detail = {
    schema: SCHEMA,
    card,
    task:
      task?.kind === 'task'
        ? { id: task.id, title: task.title, path: task.path, status: task.status, assigneeType: task.assigneeType, assignee: task.assignee, criteria: task.criteria, blockers: task.blockers }
        : null,
    requirement:
      requirement?.kind === 'requirement' ? { id: requirement.id, title: requirement.title, path: requirement.path, status: requirement.status } : null,
    pulls,
    warnings,
  };
  if (wantsText) {
    deps.out(`${textLine(card)}\n`);
    if (detail.task) deps.out(`task: ${detail.task.id} ${detail.task.path}\n`);
    if (detail.requirement) deps.out(`requirement: ${detail.requirement.id} ${detail.requirement.path}\n`);
    for (const pull of pulls ?? []) deps.out(`pull: #${pull.number} ${pull.title} ${pull.url}${pull.closes ? ' (closes)' : ''}\n`);
    for (const warning of warnings) deps.err(`${warning}\n`);
  } else {
    deps.out(`${JSON.stringify(detail)}\n`);
  }
  return EXIT.ok;
}

/**
 * Where the Project and the repositories came from, and which files gave the roster (DEC-018 item 9).
 * `contributors` lists, for each person or agent, the layers it comes from, lowest first.
 */
function configOf(setup: Setup): { source: string; file: string | null; roster: { layer: string; file: string | null }[]; contributors: { id: string; layers: string[] }[] } {
  return {
    source: setup.source,
    file: setup.decidedBy ?? null,
    roster: setup.rosterFiles.map((r) => ({ layer: r.layer, file: r.file ?? null })),
    contributors: (setup.roster?.contributors ?? []).map((c) => ({ id: c.id, layers: setup.rosterOrigins.get(c.id.toLowerCase()) ?? [] })),
  };
}

/** What `list` says about each repository: whether it has a process file, and which guideline applies (DEC-019). */
function repositorySummaries(
  repositories: readonly string[],
  processes: ReadonlyMap<string, ProcessReport>,
): { repository: string; process: ProcessReport['file']; guideline: ProcessReport['guideline']; startable: boolean }[] {
  return repositories.map((repository) => {
    const found = processes.get(repository.toLowerCase());
    return { repository, process: found?.file ?? 'missing', guideline: found?.guideline ?? null, startable: found?.startable ?? false };
  });
}

function textLine(card: CliCard): string {
  const marks = card.stale.length ? `  [${card.stale.join(', ')}]` : '';
  return `${card.repository}#${card.number}\t${card.column}\t${card.title}${marks}`;
}
