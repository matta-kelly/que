---
type: type
---
The concern this plugin holds, in one line: what it is, and when an agent uses it.
- [[#Parts]] how its ops and skills give its capabilities

- [[plugin-contract]]: what a plugin gives the harness, and what it promises
- its code: the plugin's `io.github.matta-kelly.que/index.ts` (`definePlugin`), which holds its values and the nodes it holds: its kind (`kind`: a connector when left out, or `"domain"`, which says what it uses and gives no credential, connect, whoami or roles), what it uses, its credential, connect and whoami, and its ops, roles and capabilities. This note, of the same name, gives the prose

---
## Parts
