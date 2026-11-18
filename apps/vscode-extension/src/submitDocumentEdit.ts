/**
 * Check the document revision and submit an edit without yielding in between.
 * VS Code may refuse an edit when a newer document revision reaches its model.
 * Such refusals, including rejected promises, must leave the webview draft intact.
 * This does not make guarantees for external disk changes not yet loaded by VS Code.
 */
export function submitDocumentEdit(
  document: { readonly version: number; readonly isClosed?: boolean },
  expectedVersion: number,
  apply: () => Thenable<boolean>,
): Promise<boolean> {
  if (document.isClosed || document.version !== expectedVersion) return Promise.resolve(false);
  try {
    // Invoke in this synchronous turn; do not insert an await between the version
    // check and the VS Code call. The returned thenable may settle later.
    return Promise.resolve(apply()).catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}
