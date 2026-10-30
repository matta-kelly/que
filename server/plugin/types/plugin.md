---
type: type
---
The concern this plugin holds, in one line: what it is, and when an agent uses it.
- [[#Parts]] how its ops and skills give its capabilities

- [[plugin-contract]]: what a plugin gives the harness, and what it promises
- its code: the plugin's `io.github.matta-kelly.que/index.ts` (`definePlugin`), which holds its values and the nodes it holds: its kind (`kind`: a connector when left out, or `"domain"`, which uses connectors' ops and skills and gives no credential, connect, whoami or roles), the skills it uses (`usesSkills`), its credential, connect and whoami, and its ops, roles and capabilities. The ops it uses (`usesOps`) are not in it: they are made from its ops' and skills' `uses` when it is read. This note, of the same name, gives the prose

---
## Parts
