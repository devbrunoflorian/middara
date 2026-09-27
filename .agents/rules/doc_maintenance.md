---
description: Rule for keeping the documentation and README index updated after architectural or logic changes.
---

# Documentation Maintenance Protocol

To prevent the project's knowledge from becoming fragmented, outdated, or getting lost in long conversation histories, you must enforce a strict documentation protocol.

## Core Rule
**Whenever you make a significant architectural decision, uncover a complex bug, or implement a new core system, you MUST document it.**

### Workflow:
1. **Stop and Breathe:** Do not rush into writing patches for complex, recurring bugs (e.g., layout overlap, font discrepancies). Stop coding and analyze the root cause.
2. **Draft the Document:** Write a clear `.md` file in the `docs/` folder explaining the problem, the root cause, and the architectural constraint/solution.
3. **Update the Index:** Every new document MUST be linked in the `Documentation Index` section of the main `README.md` at the project root.
4. **Update Customizations:** If the learning is a repeatable debugging step or behavioral rule, extract it into `.agents/rules/` or `.agents/skills/`.

### Example Triggers:
- Changing the strategy for text block positioning (e.g., moving from absolute lines to absolute blocks with justified paragraphs).
- Discovering a new type of font embedding in the PDF (e.g., Type0 CID Identity-H).
- Implementing a new constraint on the editor UI.
