/** Discard an asynchronous result when its panel was closed while loading. */
export async function whilePanelAlive<T>(
  panel: { onDidDispose(listener: () => void): { dispose(): unknown } },
  load: () => Promise<T>,
  apply: (value: T) => void,
): Promise<void> {
  let disposed = false;
  const listener = panel.onDidDispose(() => { disposed = true; });
  try {
    const value = await load();
    if (!disposed) apply(value);
  } finally {
    listener.dispose();
  }
}
