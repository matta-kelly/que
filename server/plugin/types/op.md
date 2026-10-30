---
type: type
---
What this op does, in one line: a verb and its object.
- [[#Use]] when the model calls it, and which op to call in its place
- [[#Writes]] what it changes, and the key it finds a record by. None for a read
- [[#Role]] the role whose login it runs with, when its plugin lists roles

- [[op-contract]]: what makes a good op: its tool card, its answers, and what a write promises
- its uses: the ops it calls, in its `uses`. Each is an op's name, or it fails (`basis/link`). A connector's op lists none, and a domain's op only connectors' ops (`plugin/op-uses`). Its plugin's `usesOps` is made from these lists and its skills'
- its context: what its run gets, by its plugin's kind. A connector's op gets `{ conn }`, its connection; a domain's op gets `{ ops }`, a function for each op it uses ([[op-contract#Context]])
- its code: the plugin's `io.github.matta-kelly.que/ops/`, which holds its tool card, its input and its run. Its name is its tool name, and this note, of that name, gives the prose

---
## Use

## Writes

## Role
