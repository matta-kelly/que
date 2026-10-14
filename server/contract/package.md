---
type: component
description: "The package contract for que, in words: what a package is, what it gives the harness, and what it promises. Read before writing a package, or before changing what the harness reads from one. The code of the contract is `package-spec.ts`."
status: running
---
A package is one concern, in one folder. It is everything an agent can get from that concern, said in a form the harness can read without knowing the domain.

- [[#What it gives the harness]] the parts, and which one is required
- [[#What it promises]] how its operations answer
- [[#What it never knows]] the line between a package and the harness
- [[#Capabilities and cases]] what it is for, and how that is proved

## What it gives the harness

- **who it is**: a name, a title, and a description that says what it is and when to use it. The only required part
- **what it needs**: a credential, if it talks to a service. Each user gives their own. A user with no credential does not get the package
	- `connect` turns a credential into a connection. The connection is what the operations get, never the credential
	- `whoami` says who the connection is logged in as, so "me" and "mine" mean something to the model
- **what the model can do**: operations. Each has a name, a title, a description, and a schema of its input in which every field is described
	- the description is the whole tool card: when to use it, which operation to use in its place, what it returns, and its limits
- **what the model can read**: skills. Each is a text with a title and a description, read when the model asks for it
- **what it is for**: capabilities. Each is an outcome someone asks for, made from its operations and skills
- a package carries only the parts it uses: skills only, operations only, or both
- what the definition does not list, the harness does not read

## What it promises

- nothing found is a normal answer, not a failure
- a list is capped. When more match, the answer says how to get the next page
- a real failure is one kind of error, `OperationFailed`, with a message that says which failure it was (timeout, unreachable, refused, the service's own error), so the model can tell the user what to do. Any other error is a bug in the package
- every call to a service has a time limit

## What it never knows

- which agent uses it, or how it is shown to the model
- any agent framework. It imports only `@que/core` and `zod`, and the harness supplies both
- the test: if removing the folder needs a change to the harness, it was not a package

## Capabilities and cases

- two kinds of package, by what they touch. The contract does not know the kind
	- connector: one service
	- domain: across services
- an operation is shown to be right by its tests. A capability is shown to work by its cases
- a case is one behaviour of one capability, in text
	- `capability`: the capability it is about
	- `input`: what the user says
	- `start`: what is true before the run
	- `good`: one statement, true or false after the run
- cases sit beside the package, in `cases.ts`. No agent is given one
- a case runs against the real service. A case that changes data changes real data

## Layout

```
<name>/
  index.ts                 the definition, as the default export (definePackage)
  ops/                     the operations
  skills/<skill>/SKILL.md  one for each skill the definition names
  cases.ts                 the cases (defineCases)
  index.test.ts            the tests, with no network
```
