## Brief overview
- Guidelines for searching the entire project for related changes when planning modifications in plan mode.

## Project-wide search in plan mode
- Always perform a comprehensive search across the whole project to identify all code, config, and documentation that may be affected by the planned change.
- Use regex or keyword-based search to find direct and indirect dependencies or references.
- Review results for both obvious and non-obvious impact areas, including cross-module interactions.

## Planning workflow
- Document all findings from the project-wide search in the planning phase.
- List all files and modules that may require updates or review.
- Consider edge cases and indirect effects when outlining the implementation plan.

## Trigger cases
- Any planned change that could affect multiple files, modules, or features.
- Refactoring, dependency updates, or architectural changes.

## Exceptions
- No search is required for isolated changes that are guaranteed to have no impact outside a single file or module.
