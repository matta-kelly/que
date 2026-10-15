---
type: component
description: "What an operation is in que, and what makes a good one: its tool card, how it answers, and what a write promises. Read before writing or reviewing an operation. The code is the `Operation` type in `package-spec.ts`."
status: running
---
An operation is one thing the model can do in a package. The harness turns each one into a tool, named `<package>_<operation>`.
- [[#Tool card]] what the model reads before it calls
- [[#Input]] what it takes
- [[#Answer]] what comes back
- [[#Writes]] what an operation that changes data promises

- [[package]]: the contract an operation is part of

## Tool card

The model knows only what the card says, so the card is the whole interface.

- `name`: a verb and its object (`getCompany`, `findPartners`). The harness puts the package name in front
- `title`: a few words, for people
- `description`
	- when to use it
	- which operation to use in its place (`To search by name, use findPartners instead`)
	- what it returns
	- its limits: caps, and what it does not cover

## Input

- the schema is a zod object, and every field is described
- a field with a few allowed values is an enum, not free text
- a value that is not allowed fails with the list of allowed ones, so the next call can be right

## Answer

- nothing found is a normal answer, not a failure. It says what was looked for, and where to look instead (`Odoo id 12 is not a company: it's a buyer of Acme; call getCompany with id 7`)
- a list is capped. When more match, the answer says how to get the next page
- a real failure is one kind of error, `OperationFailed`, with a message that says which failure it was (timeout, unreachable, refused, the service's own error), so the model can tell the user what to do. Any other error is a bug in the package
- every call to a service has a time limit

## Writes

- the same call twice gives the same result: it finds the record by its key and creates or updates it. Never a blind create
- the answer says what it did: created, updated or unchanged, with the record's id. The model does not have to read again to check
- the description says what it changes
