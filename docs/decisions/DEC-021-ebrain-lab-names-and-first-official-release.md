# DEC-021: Weaver is published under ebrAIn.lab names, and 0.1.19 is its first official release

- Status: proposed on 2026-11-08; it becomes accepted when the maintainer merges the pull request that adds it
- Date: 2026-11-08
- Related: `REQ-004`, `REQ-001`, keeps [DEC-007](./DEC-007-central-project-is-configuration.md) (nothing in Weaver names an organization)

## Context

The repository moved to the ebrAIn-Lab-3B organization and the product is now "ebrAIn.lab Weaver". Three names still say `palab`: the package scope (`@palab/weaver-markdown`, `@palab/weaver-github`, `@palab/weaver-cli`, `@palab/weaver-vscode-extension`), the extension publisher (`palab`), and so the extension id (`palab.weaver`).

Five releases exist on GitHub, all marked as pre-releases, with the tags `v0.0.3`, `v0.1.0`, `v0.1.3`, `v0.1.4`, and `v0.1.5`. The maintainer said on 2026-11-08 that nobody else has used them, that they are to be deleted, and that no further confirmation is needed. The maintainer wants to use the next version too, and chose the number 0.1.19.

## Decision

1. **The names.** The package scope is `@ebrain-lab`, the extension publisher is `ebrain-lab`, and the extension keeps the name `weaver`, so its id is `ebrain-lab.weaver`. The display name is "ebrAIn.lab Weaver". The manifests point to the repository `ebrAIn-Lab-3B/Weaver`. The `weaver` command, the settings (`weaver.*`), the command ids (`weaver.*`), the file formats, and the schema are not changed.
2. **No migration.** The extension id changes, so a VS Code that has `palab.weaver` shows two extensions until the old one is removed. The maintainer says nobody else has it, so there is no migration step, and the guides do not mention the old id (amended on 2026-11-08: the maintainer first allowed one sentence about it, then asked for it to be removed).
3. **The packages stay unpublished.** Nothing is published to npm (publishing to a registry is still deferred as `TASK-022`), so the scope change touches only the workspace.
4. **The version is 0.1.19** for the extension and the command line tool. It is the first official release.
5. **The old tags and releases are deleted**: `v0.0.3`, `v0.1.0`, `v0.1.3`, `v0.1.4`, `v0.1.5` and the five GitHub releases made from them, on the maintainer's instruction above. This is done once, at the release, and not earlier.
6. **The new release.** A tag `v0.1.19` on the commit that has the rename and the version, and one public GitHub release (not marked as a pre-release) with `weaver-0.1.19.vsix` and `weaver.js` attached. Its notes are written new: what Weaver is and does, and what a person needs to start. They are not a list of changes since 0.1.5.
7. **The order.** The rename and the version change are merged first. Then the files are built from that commit, the old tags and releases are deleted, and the new tag and release are made. The release is made only after the guides for using Weaver (`TASK-092`, [#245](https://github.com/ebrAIn-Lab-3B/Weaver/issues/245); `TASK-094`, the README, [#252](https://github.com/ebrAIn-Lab-3B/Weaver/issues/252); `TASK-095`, the dogfooding guide, [#254](https://github.com/ebrAIn-Lab-3B/Weaver/issues/254)) are merged.

## Reasons

- The names say who owns the product. Changing them before the first official release costs nothing, and changing them after costs every installed extension.
- Deleting releases that nobody used, once, before the first official one, gives one clean history for the first person who does use Weaver. It cannot be undone, which is why the instruction is recorded here.

## Consequences

- Tasks of `REQ-004` follow: the rename in the manifests, imports, and documents; the version and the release notes; the release itself.
- Documents that name `@palab/*` or `palab.weaver` as the current names are updated. Documents that record the past (decisions, the old release notes) keep their wording.
- The old extension files cannot be fetched from GitHub after the deletion. The released 0.1.5 file is kept in the maintainer's local `dist` folder.

## Decision points for the maintainer

- **Item 1, the names.** `ebrain-lab` is the organization's name in lower case with a hyphen, which a publisher id allows. The alternatives are shorter (`ebrainlab`) or without the scope change (keep `@palab` inside the workspace, since it is not published). The scope is a name inside the workspace today, so only the publisher is visible to a person.
- **Item 4, the number.** 0.1.19 follows the maintainer's choice. A number such as 1.0.0 would say more about readiness; 0.1.19 says it is early.

## Not decided yet

- Publishing to the Marketplace or Open VSX (`TASK-022`).
- Building and attaching the files by a workflow when a tag is pushed ([REQ-004](../requirements/REQ-004-distribute-the-extension.md)), instead of by hand.
