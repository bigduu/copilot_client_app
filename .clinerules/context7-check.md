## Brief overview
- Guidelines for ensuring Context7 documentation is checked before using or integrating any external library in the project.

## When to check Context7
- Always check Context7 documentation before:
  - Adding a new external library or dependency.
  - Using a new API or feature from an existing external library.
  - Making architectural decisions that involve third-party packages.

## How to check Context7
- Use the `resolve-library-id` tool to obtain the correct Context7-compatible library ID for the target library.
- Use the `get-library-docs` tool to fetch up-to-date documentation for the relevant topic or API.
- Review the documentation for best practices, usage patterns, and compatibility notes.

## Implementation workflow
- Do not proceed with code changes involving external libraries until Context7 documentation has been consulted.
- Document the Context7 query results and any relevant findings in the planning or code comments if applicable.

## Trigger cases
- Requests to install, update, or use any package not authored in the project.
- Refactoring code to use a new feature from a third-party library.
- Integrating with external APIs or SDKs.

## Exceptions
- No check is required for standard library features or code that does not involve external dependencies.
