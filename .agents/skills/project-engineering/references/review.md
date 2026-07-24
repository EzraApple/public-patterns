# Architecture review

The goal is not to demand the cleverest design. It is to keep the system easy
to reason about after the original context is forgotten.

## When review is warranted

Apply this review when a change introduces:

- a new Worker, queue, Workflow, store, or service binding
- a new gateway, repository, service layer, or shared package
- a new durable data flow or source abstraction
- meaningful state duplication or denormalization
- a large new structural module

Small fixes and straightforward feature additions usually need no architecture
review.

## Questions

1. What current problem requires the new structure?
2. Could the existing feature own the behavior directly?
3. Is there a second concrete consumer proving the abstraction?
4. Could the operation remain synchronous?
5. What failure, deployment, or testing property does the boundary add?
6. Is there derivable state being persisted unnecessarily?
7. Does the PR description name the simpler alternative and why it lost?

Ask concrete questions about the changed files. Do not invent a complete
redesign when the chosen architecture is reasonable.

## Common warning signs

- generic interfaces with one implementation
- repositories wrapping D1 without adding a meaningful boundary
- queues added for work that fits safely in one call
- parallel dev/prod or admin/public code paths that could share one operation
- abstractions based on predicted sources instead of observed source behavior
- large grab-bag modules mixing unrelated responsibilities
- comments documenting rejected designs instead of current constraints

## File hygiene

File length alone is not a problem. Split when a module mixes responsibilities
and there is a coherent local boundary. Avoid extracting tiny components or
helpers only to satisfy a numerical limit.

For behavior-preserving cleanup, use the `simplify` skill after correctness is
established.
