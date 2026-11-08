# DEC-020: A GitHub page opens in VS Code's built-in browser, with the system browser as the fallback

- Status: accepted on 2026-11-08 (pull request #240); item 5 amended on 2026-11-08 after the maintainer tried the result (see Context)
- Date: 2026-11-08
- Related: `REQ-018`, `US-053`, keeps [DEC-008](./DEC-008-agent-identity-and-write-confirmation.md)

## Context

[REQ-018](../requirements/REQ-018-finish-work-without-leaving-weaver.md) asks that work Weaver starts (a pull request with a starting process file, for example) can be finished on GitHub's own page without leaving VS Code, and later without leaving the Weaver application.

A small prototype (`apps/vscode-extension/src/prototypeBrowser.ts` on the branch `proto/req-018-open-github-page`, not merged) tried the ways an extension can show the page. Observed on 2026-11-08, VS Code 1.145.2, default settings, a private repository:

- `vscode.env.openExternal(url)` opened GitHub's own page in an editor tab, in the built-in browser view of VS Code.
- `simpleBrowser.show(url)` also opened it there, in a tab with the same toolbar. Both were chosen by the maintainer as "GitHub page in an editor tab".
- The page asked for a GitHub sign-in on the page itself (and Google, for the maintainer's account), and was complete afterwards: reading, the file list, comments.
- GitHub answers with `X-Frame-Options: deny`, so a webview that frames github.com stays blank. That way was not tried, because the header settles it.
- VS Code has settings for the built-in browser: where a new tab goes (`workbench.browser.newTabPlacement`) and how long sign-ins are kept (`workbench.browser.dataStorage`).
- An extension has no public command that opens an arbitrary address in the built-in browser. The built-in browser takes a page address only through an editor option that extensions cannot pass.

Then `openPage` (TASK-090, pull request #247) was tried in VS Code by the maintainer on 1.145.2: a page opens in an editor tab right next to the current tab, and a page chosen later opens in a new tab next to it. The maintainer found that enough.

Not observed: any VS Code before 1.145 (the extension supports 1.90 and later). Simple Browser's call that takes a column (`simpleBrowser.api.open`) was not needed, so it was not tried.

## Decision

1. **Weaver opens a GitHub page with Simple Browser's command (`simpleBrowser.show`) when VS Code's built-in browser is present.** Present means that the command `workbench.action.browser.zoomIn` exists in the running VS Code. This is a check of a capability at run time, not of a version number, so Weaver needs no table of versions.
2. **When the built-in browser is not present, Weaver opens the page with `vscode.env.openExternal`**, which uses the system browser. On such a VS Code Simple Browser would frame the page and show nothing, which is worse than leaving.
3. **"Open in the browser" stays one explicit action** that always uses the system browser ([REQ-018](../requirements/REQ-018-finish-work-without-leaving-weaver.md)).
4. **Sign-in is on the page.** Weaver does not put its own token in the page and does not read the page. The person signs in once on the page; how long that is kept is VS Code's setting `workbench.browser.dataStorage`, which the guide names.
5. **Where the tab goes** is VS Code's own choice: it opens next to the current tab in the same editor group, and a page opened later opens in a new tab next to it. Weaver does not pass a column. A person who wants the page in another column moves the tab, or sets `workbench.browser.newTabPlacement`; the guide names the setting.
6. **Weaver follows what happens on the page through the API.** For a pull request or Issue that Weaver opened a page for, it reads the state (open, merged, closed, checks) and updates the Overview without a manual refresh. It reads only the items it opened, when the VS Code window regains focus and every 60 seconds for up to ten minutes after the page was opened, and stops when the item is merged or closed. These limits are a first guess; they are changed by a task when use shows a better one.
7. **The application** shows the page in its own browser view with the same rules (sign-in on the page, no token in the page, the same state follow). Its decision is made when the application is built.
8. **A merge, a review, or a comment on the page is the person's own act on GitHub.** Weaver's own writes keep their plan and confirmation ([DEC-008](./DEC-008-agent-identity-and-write-confirmation.md)).

## Reasons

- It finishes the work inside VS Code, which is what the maintainer asked for, with no new dependency and no second extension.
- Checking for the browser command avoids a blank page on an old VS Code and avoids guessing a version.
- Following the state through the API is what closes the loop: the page is where the person acts, and the Overview is where Weaver learns the result.

## Consequences

- Tasks of `REQ-018` that follow, once this is accepted: open pages by item 1 and item 2 from the card and from the pull request notice; follow the state by item 6; a guide that names the two VS Code settings, the sign-in, and the fallback.
- The text of the prototype is a throwaway and is not in the message catalog; the real command uses the catalog (English and Korean).
- The built-in browser's own behavior (placement, sign-in storage, the command that tells whether it is there) belongs to VS Code and can change. Item 1 is a check at run time for that reason.

## Decision points for the maintainer

- **Item 1, Simple Browser's command or `openExternal` alone.** On 1.145.2 both ended in the same tab. `openExternal` alone is less code, and on an old VS Code it already leaves for the system browser. The cost is that it gives no way to say where the tab goes. Simple Browser's command is chosen because the maintainer picked it and because it gives that option.
- **Item 6, the limits.** Every 60 seconds for ten minutes is a guess. A shorter time asks GitHub less and may miss a late merge; a longer one is the other way round.

## Not decided yet

- How the application opens the page (item 7).
- Showing a merge or close from Weaver's own dialog. It is left out here; the maintainer prefers GitHub's own page.
