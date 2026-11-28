import { describe, expect, it } from 'vitest';
import { closesIssue, describePull, evidenceGaps, formatNotice, Locale, Notice, summarizeChecks } from '../src';

const text = (notices: Notice[], locale: Locale = 'en') => notices.map((n) => formatNotice(n, locale));

const pull = (over: Partial<Parameters<typeof describePull>[0]> = {}) => ({
  number: 7, title: 't', url: 'u', state: 'merged' as const, checks: 'passing' as const, link: 'closes' as const, ...over,
});

describe('summarizeChecks', () => {
  it('reports none when there are no runs', () => {
    expect(summarizeChecks([])).toBe('none');
  });
  it('passes only when every run completed successfully', () => {
    expect(summarizeChecks([{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'success' }])).toBe('passing');
  });
  it('fails when any run failed, even if others are pending', () => {
    expect(summarizeChecks([{ status: 'completed', conclusion: 'failure' }, { status: 'in_progress', conclusion: null }])).toBe('failing');
  });
  it('is pending while a run is unfinished', () => {
    expect(summarizeChecks([{ status: 'completed', conclusion: 'success' }, { status: 'queued', conclusion: null }])).toBe('pending');
  });
});

describe('evidenceGaps', () => {
  it('demands nothing before Review', () => {
    expect(evidenceGaps('In progress', { pulls: [] })).toEqual([]);
    expect(evidenceGaps('Backlog', undefined)).toEqual([]);
  });
  it('flags a Review task without a pull request', () => {
    expect(evidenceGaps('Review', { pulls: [] })).toEqual([{ code: 'gap.no-linked-pr' }]);
  });
  it('flags Verified without a merged pull request', () => {
    expect(evidenceGaps('Verified', { pulls: [pull({ state: 'open' })] })).toContainEqual({ code: 'gap.no-merged-pr' });
  });
  it('accepts a merged pull request with passing checks', () => {
    expect(evidenceGaps('Verified', { pulls: [pull()] })).toEqual([]);
  });
  it('asks Verified for a pull request that closes the Issue, not only one that mentions it', () => {
    const mention = { pulls: [pull({ link: 'mentions' })] };
    expect(evidenceGaps('Verified', mention)).toEqual([{ code: 'gap.no-closing-pr' }]);
    expect(evidenceGaps('Review', mention)).toEqual([]);
    expect(evidenceGaps('Verified', { pulls: [pull({ link: 'mentions' }), pull({ number: 8 })] })).toEqual([]);
  });
  it('flags failing, pending, and missing checks', () => {
    expect(text(evidenceGaps('Review', { pulls: [pull({ checks: 'failing' })] }))).toEqual(['PR #7 has failing checks']);
    expect(text(evidenceGaps('Review', { pulls: [pull({ checks: 'pending' })] }))).toEqual(['PR #7 checks are still running']);
    expect(text(evidenceGaps('Review', { pulls: [pull({ checks: 'none' })] }))).toEqual(['PR #7 has no check runs']);
  });
  it('groups pull requests that share a check state into one line', () => {
    const pulls = [pull({ number: 6, checks: 'none' }), pull({ number: 7, checks: 'none' }), pull({ number: 9, checks: 'failing' })];
    const gaps = evidenceGaps('Verified', { pulls });
    expect(text(gaps)).toEqual(['PR #9 has failing checks', 'PRs #6, #7 have no check runs']);
    expect(text(gaps, 'ko')).toEqual(['체크가 실패한 PR이 있습니다: #9', '체크 실행이 없는 PR이 있습니다: #6, #7']);
  });
  it('ignores pull requests closed without merging', () => {
    expect(evidenceGaps('Review', { pulls: [pull({ state: 'closed', checks: 'none' }), pull({ number: 9 })] })).toEqual([]);
  });
  it('says so when evidence was not loaded', () => {
    expect(evidenceGaps('Verified', undefined)).toEqual([{ code: 'gap.evidence-not-loaded' }]);
  });

  it('does not infer absence of a linked or closing PR from a partial read', () => {
    const unavailablePulls = [{ url: 'https://github.com/o/r/pull/9', error: { code: 'github.err.http' as const, args: { status: 403 } } }];
    expect(evidenceGaps('Verified', { pulls: [], unavailablePulls }).map((gap) => gap.code)).toEqual(['gap.evidence-not-loaded']);
    const gaps = evidenceGaps('Verified', { pulls: [pull({ link: 'mentions' })], unavailablePulls }).map((gap) => gap.code);
    expect(gaps).toContain('gap.evidence-not-loaded');
    expect(gaps).not.toContain('gap.no-closing-pr');
  });
});

describe('describePull', () => {
  it('summarizes state and checks', () => {
    expect(describePull(pull())).toBe('PR #7 merged · checks passing · closes Issue');
    expect(describePull(pull({ checks: 'none', state: 'open' }))).toBe('PR #7 open · no check runs · closes Issue');
    expect(describePull(pull({ link: 'mentions' }))).toBe('PR #7 merged · checks passing · mentions Issue');
    expect(describePull(pull({ link: 'mentions' }), 'ko')).toBe('PR #7 병합됨 · 체크 통과 · Issue를 언급');
  });

  it('keeps an unavailable closing association distinct from a missing one in both locales', () => {
    const unknown = pull({ link: 'unknown' });
    expect(describePull(unknown)).toContain('closing association unavailable');
    expect(describePull(unknown, 'ko')).toContain('종료 연결을 확인할 수 없음');
    const gaps = evidenceGaps('Verified', { pulls: [unknown] });
    expect(gaps.map((gap) => gap.code)).toContain('gap.closing-unknown');
    expect(gaps.map((gap) => gap.code)).not.toContain('gap.no-closing-pr');
  });

  it('does not call neutral or skipped checks passing', () => {
    expect(summarizeChecks([{ status: 'completed', conclusion: 'neutral' }])).toBe('unknown');
    expect(summarizeChecks([{ status: 'completed', conclusion: 'skipped' }])).toBe('unknown');
    expect(evidenceGaps('Verified', { pulls: [pull({ checks: 'unknown' })] }).map((gap) => gap.code)).toContain('gap.checks-unknown');
    expect(describePull(pull({ checks: 'unknown' }), 'ko')).toContain('체크 결과 불명확');
  });

  it('reports failing, pending and unavailable status contexts separately from passing check runs', () => {
    for (const [state, code] of [['failure', 'gap.status-failing'], ['pending', 'gap.status-pending'], ['unknown', 'gap.status-unknown']] as const) {
      const gaps = evidenceGaps('Verified', { pulls: [pull({ checks: 'passing', statusContexts: { state, apiUrl: 'https://api.github.com/status' } })] });
      expect(gaps.map((gap) => gap.code)).toContain(code);
    }
  });
});

describe('closesIssue', () => {
  it('accepts GitHub closing keywords for the same Issue', () => {
    expect(closesIssue('Closes #5', 5)).toBe(true);
    expect(closesIssue('fixed #5 and more', 5)).toBe(true);
    expect(closesIssue('Resolves: ebrAIn-Lab-3B/Weaver#5', 5)).toBe(true);
  });
  it('treats a bare reference or another Issue as a mention', () => {
    expect(closesIssue('See #5 for context', 5)).toBe(false);
    expect(closesIssue('Closes #50', 5)).toBe(false);
    expect(closesIssue('Closes #6', 5)).toBe(false);
    expect(closesIssue('TASK-005 relates', 5)).toBe(false);
    expect(closesIssue(null, 5)).toBe(false);
  });
});
