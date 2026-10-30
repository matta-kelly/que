---
type: type
---
What this skill tells the model, in one line.
- [[#When to read it]] the question that makes the model read it

- [[plugin-contract]]: a skill is an Agent Skills `SKILL.md`: a name, a description and a title, read when the model asks for it
- [[skill-contract]]: what makes a good skill: its description, its body and its proof
- its uses: the ops it uses, named in its frontmatter's `allowed-tools`, space-separated. Each is an op's name, or it fails (`basis/link`). A connector's skill lists only its own ops, and a domain's skill only connectors' ops (`plugin/connector-use`, `plugin/own-use`). With none, it uses none. Its plugin's `usesOps` is made from these lists and its ops'
- its text: the plugin's `skills/<skill>/SKILL.md`, found by folder. Its name is its folder's, unique in the graph, and this note, of that name, gives the prose

---
## When to read it
