# Spec: [Feature Name]

## Source Requirement
Link to the relevant requirements file(s):
- [`../requirements/[feature].md`](../requirements/[feature].md)

## Overview
One paragraph describing what this feature does from a technical perspective and where it fits in the system.

## Data Models

Describe the shape of data involved. Use TypeScript-style types or plain English tables — be explicit about optional fields, nullability, and enums.

```
JobListing {
  id: string
  title: string
  company: string | null
  ...
}
```

## API Contract

For each endpoint or function, specify:

### `GET /api/jobs`
- **Purpose**: Returns paginated list of job listings
- **Query params**: `page`, `pageSize`, `status`
- **Response**: `{ items: JobListing[], total: number }`
- **Errors**:
  - `400` — invalid query params

## Component / UI Behaviour

Describe what the user sees and how the UI responds to interactions. Reference designs or wireframes if available.

- On load: fetches first page of jobs
- Clicking a row: marks job as "seen" and opens detail panel
- Empty state: displays "No jobs found" message

## Business Rules & Constraints

Explicit rules the implementation must follow:

- Jobs deduped by external ID — re-syncing the same job must not create a duplicate
- Rate field displays "Not disclosed" if null
- Pagination page size defaults to 25, max 100

## Edge Cases

- What happens when the external API is unavailable?
- What happens with malformed data from the source?
- What are the boundary conditions (empty list, single item, maximum page size)?

## Acceptance Criteria

Precise, testable statements — ideally reusable as test case descriptions:

- [ ] Given no jobs exist, the list endpoint returns `{ items: [], total: 0 }`
- [ ] Given a job with no rate, the UI displays "Not disclosed"
- [ ] Given an invalid `status` filter value, the API returns `400`

## Out of Scope
Explicitly list what this spec does NOT cover:

- Authentication / authorisation
- Mobile-specific layout

## Open Questions
- Questions that must be resolved before or during implementation

## Notes
- Links to related specs, ADRs, or external documentation

# Change Log

|Date | Change |
| --- | --- |
| 25 April 2026 | First draft |