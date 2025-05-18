## Brief overview
- Guidelines for extracting React components and managing duplication in the project.

## Component extraction criteria
- Extract a new component if a JSX node or block in a frontend file exceeds 30 lines.
- Ensure the extracted component is reusable and general enough to cover all use cases found in the project.

## Duplicate detection and consolidation
- Search the entire project for duplicate or similar JSX structures before extracting a component.
- Refactor all matching or similar code to use the new component, ensuring consistency and reducing duplication.

## Implementation workflow
- After identifying a large JSX block, perform a project-wide search for similar code.
- Design the new component API to accommodate all detected use cases.
- Replace all duplicate or similar blocks with the new component.

## Trigger cases
- Any JSX node or block in a frontend file that exceeds 30 lines.
- Detection of repeated or similar UI structures across multiple files.

## Exceptions
- Do not extract components for isolated, one-off UI blocks that are not repeated and are unlikely to be reused.
