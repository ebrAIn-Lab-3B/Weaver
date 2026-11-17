---
id: TASK-117
type: task
title: Render Mermaid diagrams and preserve failure fallback
requirement: REQ-021
issue: https://github.com/ebrAIn-Lab-3B/Weaver/issues/316
repository: ebrAIn-Lab-3B/Weaver
assignee_type: agent
criteria: [AC-003, AC-004, AC-005]
---

# TASK-117 Render Mermaid diagrams and preserve failure fallback

After TASK-115 and the rendered-view foundation in TASK-116, render valid Mermaid fences as diagrams. Keep other code fences as code. For invalid or unsupported diagrams, keep source accessible, explain the problem, and continue rendering the rest of the document.

Verify valid and invalid Mermaid, an unsupported diagram, an ordinary code fence, and access to unchanged source. A named agent owner remains to be assigned.

Progress: Weaver bundles Mermaid and contributes rendering to the VS Code Markdown preview. A test covers successful rendering and the invalid-diagram fallback. On 2026-11-18 the maintainer confirmed Mermaid operation in the installed build. Verify failure fallback, coexistence with other Mermaid preview extensions, and unsupported formats before treating the task as complete.
