export interface ExpectedDocumentChange { version: number; offset: number; length: number; text: string }

/** A delayed event from our own WorkspaceEdit is not an external edit. */
export function matchesOwnDocumentChange(expected: ExpectedDocumentChange, version: number, changes: readonly { rangeOffset: number; rangeLength: number; text: string }[]): boolean {
  return version === expected.version && changes.length === 1 && changes[0].rangeOffset === expected.offset && changes[0].rangeLength === expected.length && changes[0].text === expected.text;
}
