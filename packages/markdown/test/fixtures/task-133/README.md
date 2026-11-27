# TASK-133 diagnosis fixtures

These files represent local, fictional task documents and two process configurations.
Run `npm run test -w @ebrain-lab/weaver-markdown -- task133Scenarios.test.ts`
from the repository root. The test supplies fictional Project cards in memory and
does not contact GitHub. It exercises missing and invalid Issue links, missing and
unknown Project membership, shared Issues, distinct Backlog and Todo values, and
missing authoritative status for both column sources, and incomplete PR evidence
on a closed Issue. Permission failures, GitHub
pagination, actual Project automation and the installed extension require separate
integration or live tests.

For a separate Windows VS Code smoke test, build and install the VSIX into an
isolated extensions directory, set `WEAVER_PACKAGED_EXTENSION_PATH` to the
installed extension directory, and run `node scripts/test-author-host.js
packaged-overview` from the repository root. This checks packaged extension
activation and opening the Overview webview, not its rendered contents.
