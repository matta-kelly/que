// que's ontology, by its old name and by its new one, as a folder outside que imports it.
// JavaScript, so que's own type check, which knows only the new name, does not read it.
export * as old from "@que/core/ontology";
export * as now from "@que/ontology";
