import { test } from "node:test";
import assert from "node:assert/strict";
import { definePackage, validatePackage } from "./package-spec.js";

const notes = definePackage({
  name: "notes",
  title: "Notes",
  description: "How the team writes things down.",
});

test("validatePackage lists a skill with a bad name, and a name used twice", () => {
  assert.throws(
    () =>
      validatePackage(
        definePackage({ ...notes, skills: ["no spaces", "greet", "greet"] }),
      ),
    (error: Error) => {
      assert.match(error.message, /skill name "notes\/no spaces" must match/);
      assert.match(error.message, /skill name "notes\/greet" is used twice/);
      return true;
    },
  );
});

test("validatePackage lists a capability with a bad name, a name used twice, and one with no title or description", () => {
  assert.throws(
    () =>
      validatePackage(
        definePackage({
          ...notes,
          capabilities: [
            {
              name: "no spaces",
              title: "Spaced",
              description: "Its name has a space.",
            },
            {
              name: "write-up",
              title: "Write up a meeting",
              description:
                "A person asks for the notes of a meeting and gets them.",
            },
            { name: "write-up", title: "", description: "" },
          ],
        }),
      ),
    (error: Error) => {
      assert.match(
        error.message,
        /capability name "notes\.no spaces" must match/,
      );
      assert.match(
        error.message,
        /capability name "notes\.write-up" is used twice/,
      );
      assert.match(
        error.message,
        /title of capability notes\.write-up is missing/,
      );
      assert.match(
        error.message,
        /description of capability notes\.write-up is missing/,
      );
      return true;
    },
  );
});
