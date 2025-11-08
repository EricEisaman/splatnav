# Rules Compliance Checklist

Use this checklist before creating plans or implementing code.

## Pre-Work Checklist
- [ ] Read `.cursor/rules/plan.mdc` (for planning phase)
- [ ] Read `.cursor/rules/create.mdc` (for implementation phase)
- [ ] Read `.cursorrules` file in project root

## TypeScript Standards
- [ ] No `any` types used
- [ ] No type casts (`as Type`, `<Type>value`)
- [ ] Proper type definitions and inference used

## Code Restrictions
- [ ] No `setTimeout` or `setInterval` used
- [ ] No `console.log`, `console.error`, or `console.warn` statements
- [ ] No timeout/delay mechanisms

## GitHub Operations
- [ ] Verified GitHub CLI authenticated as EricEisaman
- [ ] Used `gh auth status` to confirm account

## Planning Phase
- [ ] All proposed code follows rules
- [ ] Flagged any violations before implementation
- [ ] Suggested alternatives that comply with constraints

## Implementation Phase
- [ ] All code strictly adheres to rules
- [ ] Rejected any code violating constraints
- [ ] Used proper TypeScript types (no casting workarounds)
- [ ] Found alternative solutions without timeouts or logging

