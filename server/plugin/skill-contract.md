---
type: component
description: "What a skill is in que, what goes in a skill and what goes in an op, and what makes a good one: its description, its body and its proof. Read before writing or reviewing a skill."
status: running
---
skill: an instruction of a plugin, in one `SKILL.md`, that the model reads when a task needs it.
- [[#Skill or op]] where a rule goes
- [[#Description]] what makes the model read it
- [[#Body]] what it says
- [[#Proof]] how it is shown to work

- [[plugin-contract]]: the contract a skill is part of: its folder, its frontmatter and what it can use
- [[op-contract]]: what the ops it uses promise
- the rules here are the Agent Skills specification ([agentskills.io](https://agentskills.io/specification)) and Anthropic's authoring guide ([best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)), with what que adds. The plugin schema holds the frontmatter; review holds the rest

## Skill or op

An op holds what must be true whatever the model does. A skill holds what takes judgment or a conversation.

- op: an allowed value, a required field, a write that must not repeat, an action that must not exist
- skill: what to ask the user, which op to call first, how to read what the user gave, when to stop and confirm
- a rule that must never fail is not in a skill alone: a skill steers the model, and nothing forces the model to follow it
- a plugin with no judgment to give has no skill
- one skill for one way of working, such as a sales rep's, not one for each op or capability

## Description

The model chooses a skill from its line in a list, so the description is what makes it read the skill.

- it says what the skill does and when to use it, with the words a user would say
- it is in the third person, at most 1024 characters
- a vague one fails: `Helps with orders` gives the model no reason to read it

## Body

The model reads it when it runs, with the rest of the chat, so each line must change what the model does.

- it holds only what the model does not know: this business's rules, names and order of steps, not what an order is
- `read_skill` returns the text of `SKILL.md` and no other file, so all it needs is in that one file
- under 500 lines, and far less where it can be
- it says what to do, as steps when the order matters
- each fine point is one line: when this is true, do that (`when the customer has payment terms, show them and confirm`)
- where a word can mean two things, it says to ask, and names the two (`order date or ship date`)
- it says how to answer: in the user's words, not model and field names
- its freedom follows the risk: exact steps for a write that is hard to undo, and general direction where many ways are good
- one default, not a list of options, with the one exception that needs another way
- one word for one thing, the word the ops and the users use
- each op it names is in its `allowed-tools`, by its real name
- a concrete example of input and output where the result depends on seeing one
- nothing that goes out of date: no dates, and no list of what an op's answer already gives

## Proof

A skill is shown to work by the cases of its capability, as [[plugin-contract]] says.

- each fine point has a case, so a skipped step is a failed case
- a failed case tightens the line, or moves the rule into an op if it must never fail
- a change to a skill is judged by a run of its cases, not by reading it
- each model it runs on gets the run, as `just eval` runs each case under each agent config
