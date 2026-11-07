import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultProcess, observeTracking, parseProcess, startingProcessText } from '../src';

const GUIDELINE = { ref: { repository: 'org/base', path: '.weaver/process.yaml', ref: 'v2' }, text: 'version: 1\r\nstale:\r\n  idle-days: 30\r\n' };

describe('observeTracking', () => {
  it('is labels when any card carries a status label', () => {
    expect(observeTracking([{ labels: ['bug'] }, { labels: ['Status:Ready'] }])).toBe('labels');
  });

  it('is board-status when there are cards and none carries one', () => {
    expect(observeTracking([{ labels: ['bug'] }, { labels: [] }])).toBe('board-status');
  });

  it('does not guess when there is no card', () => {
    expect(observeTracking([])).toBe('unknown');
  });
});

describe('startingProcessText', () => {
  it('starts from the guideline file as it is, under a comment that names where it came from', () => {
    const text = startingProcessText({ guideline: GUIDELINE, observed: 'labels' });
    expect(text.startsWith('# Started from the guideline org/base .weaver/process.yaml@v2.\n')).toBe(true);
    expect(text.endsWith('version: 1\nstale:\n  idle-days: 30\n')).toBe(true);
    expect(parseProcess('p.yaml', text).process.stale.idleDays).toBe(30);
  });

  it('does not let how the cards are tracked change a guideline file', () => {
    expect(startingProcessText({ guideline: GUIDELINE, observed: 'labels' })).toBe(startingProcessText({ guideline: GUIDELINE, observed: 'board-status' }));
  });

  it('without a guideline, offers the defaults that match the cards, and says so', () => {
    expect(startingProcessText({ observed: 'labels' }).split('\n')[0]).toContain('carry status labels');
    expect(startingProcessText({ observed: 'board-status' }).split('\n')[0]).toContain('no status labels');
    expect(startingProcessText({ observed: 'unknown' }).split('\n')[0]).toContain('no cards yet');
  });

  it('writes files that Weaver reads without a problem', () => {
    for (const observed of ['labels', 'board-status', 'unknown'] as const) {
      expect(parseProcess('p.yaml', startingProcessText({ observed })).issues).toEqual([]);
    }
  });

  it('the labels file is what Weaver does without a file', () => {
    expect(parseProcess('p.yaml', startingProcessText({ observed: 'labels' })).process).toEqual(defaultProcess());
  });

  it('the board-status file takes the columns from the board', () => {
    const parsed = parseProcess('p.yaml', startingProcessText({ observed: 'board-status' }));
    expect(parsed.process.columns.source).toBe('board-status');
    expect(parsed.process.columns.board).toMatchObject({ Todo: 'Backlog', 'In Progress': 'In progress', Done: 'Verified' });
  });
});

describe('the files under examples/process-start', () => {
  const read = (name: string) => readFileSync(path.resolve(__dirname, `../../../examples/process-start/${name}.yaml`), 'utf8').replace(/\r\n/g, '\n');

  it('are exactly what Weaver offers, so the examples cannot drift from the code', () => {
    expect(read('labels')).toBe(startingProcessText({ observed: 'labels' }));
    expect(read('board-status')).toBe(startingProcessText({ observed: 'board-status' }));
  });
});
