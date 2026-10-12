import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import { credentialFromEnv, envName } from "./env-credentials.js";

const notes = {
  name: "notes",
  credential: z.object({ token: z.string(), url: z.string() }),
};

test("a credential field is read from QUE_PACKAGE_FIELD", () => {
  assert.deepEqual(
    credentialFromEnv(notes, {
      QUE_NOTES_TOKEN: "abc",
      QUE_NOTES_URL: "https://notes.example.test",
    }),
    { token: "abc", url: "https://notes.example.test" },
  );
});

test("a field with no variable is left out", () => {
  assert.deepEqual(credentialFromEnv(notes, { QUE_NOTES_TOKEN: "abc" }), {
    token: "abc",
  });
});

test("a name is put in upper case, and what is not a letter or a digit becomes an underscore", () => {
  assert.equal(envName("my-notes", "apiKey"), "QUE_MY_NOTES_APIKEY");
});

test("a package with none of its variables set has no credential", () => {
  assert.equal(credentialFromEnv(notes, { QUE_OTHER_TOKEN: "abc" }), undefined);
});

test("a package that needs no credential has none", () => {
  assert.equal(
    credentialFromEnv({ name: "notes" }, { QUE_NOTES_TOKEN: "abc" }),
    undefined,
  );
});
