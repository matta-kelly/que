import { test } from "node:test";
import assert from "node:assert/strict";
import { accepted, fileNamed, taken } from "./instructions.js";

test("an agent that does not take the user's instructions gets none", () => {
  assert.equal(
    taken({ name: "chat", userInstructions: true }, "No emojis."),
    "No emojis.",
  );
  assert.equal(
    taken({ name: "chat", userInstructions: false }, "No emojis."),
    undefined,
  );
  assert.equal(taken({ name: "chat" }, "No emojis."), undefined);
});

test("blank text is no text", () => {
  const takes = { name: "chat", userInstructions: true };
  assert.equal(taken(takes, ""), undefined);
  assert.equal(taken(takes, " \n\t"), undefined);
  assert.equal(taken(takes, null), undefined);
});

test("a path that is not absolute is taken from the deployment folder, and no setting names no file", () => {
  assert.equal(
    fileNamed({ DEV_USER_INSTRUCTIONS: "./agents.md" }, "/srv/shop"),
    "/srv/shop/agents.md",
  );
  assert.equal(
    fileNamed({ DEV_USER_INSTRUCTIONS: "/home/ann/agents.md" }, "/srv/shop"),
    "/home/ann/agents.md",
  );
  assert.equal(fileNamed({}, "/srv/shop"), undefined);
  assert.equal(
    fileNamed({ DEV_USER_INSTRUCTIONS: " " }, "/srv/shop"),
    undefined,
  );
});

test("text over the limit is refused, and the error says the limit", () => {
  assert.deepEqual(accepted("a".repeat(16_000), "account"), {
    text: "a".repeat(16_000),
  });
  const refused = accepted("a".repeat(16_001), "account");
  assert.ok("error" in refused);
  assert.equal(refused.status, 400);
  assert.match(refused.error, /16,000/);
});

test("a change is refused when a file sets the text", () => {
  const refused = accepted("No emojis.", "file");
  assert.ok("error" in refused);
  assert.equal(refused.status, 409);
  assert.match(refused.error, /DEV_USER_INSTRUCTIONS/);
});
