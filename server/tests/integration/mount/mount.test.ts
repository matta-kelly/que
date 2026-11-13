/**
 * Mount, against real folders: the deployments and plugins in fixtures/. Each deployment is a root of its own, made
 * from the fixtures (deploymentRoot): its plugins are installed by name, as links in its node_modules, and each is read,
 * and named, at its real folder under its plugins/. No network: mounting reads definitions and skills and opens no
 * connection.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkedCard, readPlugin } from "@mku1tra/que-plugin";
import { mountDeployment } from "../../../runtime/src/mount/deployment.js";
import {
  loadPlugin,
  mountPlugin,
  type MountedPlugin,
} from "../../../runtime/src/mount/plugins.js";
import { deploymentRoot } from "../../deployment-root.js";

const fixtures = join(import.meta.dirname, "fixtures");
const deployment = (name: string) => deploymentRoot(fixtures, name);
const names = (mounted: MountedPlugin[]) =>
  mounted.map((p) => p.definition.plugin.name);

const mount = async (name: string) =>
  (await mountDeployment(deployment(name))).plugins;

const work = mkdtempSync(join(tmpdir(), "que-mount-"));
after(() => rmSync(work, { recursive: true, force: true }));
writeFileSync(join(work, "package.json"), '{ "type": "module" }\n');

// The config of a plugin that is a root of its own, as each plugin mounted alone is.
const pluginConfig = (
  name: string,
) => `import { pluginSchema } from "@mku1tra/que-plugin";
export default {
  schema: pluginSchema({ name: "${name}", description: "A plugin of a test.", root: new URL("./", import.meta.url) }),
};
`;

/**
 * A deployment in a repo of a deployment and its plugins, as landl is: the repo is the root, and gives the deployment's
 * sources; each plugin of `plugins` is copied under the repo's plugins/ and linked into the repo's node_modules, and
 * the deployment, in a folder under the repo, names `names`, with `files` beside it. Gives the deployment's folder.
 */
const deploymentWith = (
  names: string[],
  plugins: Record<string, string> = { beta: join(fixtures, "plugins/beta") },
  files: Record<string, string> = {},
) => {
  const repo = mkdtempSync(join(work, "repo-"));
  const dir = join(repo, "deployment");
  mkdirSync(dir);
  mkdirSync(join(repo, "node_modules"));
  for (const [name, from] of Object.entries(plugins)) {
    cpSync(from, join(repo, "plugins", name), { recursive: true });
    symlinkSync(join("..", "plugins", name), join(repo, "node_modules", name));
  }
  writeFileSync(join(repo, "package.json"), '{ "type": "module" }\n');
  writeFileSync(
    join(repo, "basis.config.ts"),
    `import { defineSchema } from "@mku1tra/basis";
import { deploymentSources, harness } from "@mku1tra/que-harness";
const root = import.meta.dirname;
export default {
  schema: defineSchema({
    name: "repo",
    description: "A repo of a deployment and its plugins.",
    types: {},
    imports: [harness],
    notes: new URL("./", import.meta.url),
    skip: (path) => path.endsWith("/SKILL.md"),
    sources: deploymentSources(root + "/deployment", root),
  }),
};
`,
  );
  writeFileSync(
    join(dir, "index.ts"),
    `import { defineDeployment } from "@mku1tra/que-harness";
export default defineDeployment({
  name: "by-name",
  type: "deployment",
  description: "A deployment in a repo.",
  plugins: ${JSON.stringify(names)},
});
`,
  );
  for (const [path, text] of Object.entries(files))
    writeFileSync(join(dir, path), text);
  return dir;
};

// The definition of a deployment named `name` that names no plugin.
const bare = (
  name: string,
) => `import { defineDeployment } from "@mku1tra/que-harness";
export default defineDeployment({ name: "${name}", type: "deployment", description: "A deployment with no plugin." });
`;

// A plugin whose package.json names the @mku1tra/que-plugin it works with, as a peer, or another package.
const needing = (range: string, peer = "@mku1tra/que-plugin") => {
  const dir = mkdtempSync(join(work, "needs-plugin-"));
  cpSync(join(fixtures, "plugins/beta"), dir, { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "beta",
      type: "module",
      peerDependencies: { [peer]: range },
    }),
  );
  return dir;
};

// que's own @mku1tra/que-plugin, from the one place its version is written.
const version = (
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, "../../../plugin/package.json"),
      "utf8",
    ),
  ) as { version: string }
).version;

test("stops, naming the folder, the range and que's own version, when a plugin needs another @mku1tra/que-plugin", async () => {
  const dir = needing("^9.0.0");
  await assert.rejects(mountPlugin(dir), (error: Error) => {
    assert.ok(error.message.includes(dir));
    assert.match(error.message, /@mku1tra\/que-plugin \^9\.0\.0/);
    assert.ok(error.message.includes(`que's is ${version}`));
    return true;
  });
});

test("a plugin whose @mku1tra/que-plugin range que's own version satisfies is mounted", async () => {
  assert.deepEqual(names([await mountPlugin(needing(`^${version}`))]), [
    "beta",
  ]);
});

test("stops, saying the contract moved, when a plugin names @que/core as its peer", async () => {
  const dir = needing("^0.3.0", "@que/core");
  await assert.rejects(mountPlugin(dir), {
    message: `mount: ${dir}: the plugin contract moved to @mku1tra/que-plugin: name it as the peer in ${join(dir, "package.json")} ("@mku1tra/que-plugin": "^${version}"), in place of @que/core`,
  });
});

test("stops, naming the file, when a plugin's package.json is not JSON", async () => {
  const dir = needing("*");
  writeFileSync(join(dir, "package.json"), '{ "type": "module", }');
  await assert.rejects(mountPlugin(dir), (error: Error) => {
    assert.match(error.message, /^mount:/);
    assert.ok(error.message.includes(join(dir, "package.json")));
    return true;
  });
});

test("a plugin is found by its name, as Node finds an import of its npm package from the deployment's folder", async () => {
  const { plugins } = await mountDeployment(deploymentWith(["beta"]));
  assert.deepEqual(names(plugins), ["beta"]);
});

test("stops, naming the plugin and the deployment's index.ts, when a plugin it names is not installed", async () => {
  const dir = deploymentWith(["nowhere"]);
  await assert.rejects(mountDeployment(dir), (error: Error) => {
    assert.ok(
      error.message.includes(
        `${join(dir, "index.ts")}: The plugin nowhere is not installed`,
      ),
    );
    return true;
  });
});

test("a mounted plugin has its skills, each as MCP serves it: its SKILL.md's URI, frontmatter as written, digest and size", async () => {
  const mounted = await mount("two");
  const file = readFileSync(
    join(fixtures, "plugins/alpha/skills/alpha-greet/SKILL.md"),
  );
  const uri = "skill://alpha/alpha-greet/SKILL.md";
  assert.deepEqual(mounted[1].skills, [
    {
      name: "alpha-greet",
      title: "Greet",
      description: "How to greet a customer.",
      uri,
      entry: {
        uri,
        frontmatter: {
          name: "alpha-greet",
          description: "How to greet a customer.",
          metadata: { title: "Greet" },
        },
        resources: [
          {
            uri,
            digest: `sha256:${createHash("sha256").update(file).digest("hex")}`,
            size: file.byteLength,
          },
        ],
      },
      text: file.toString("utf8"),
      size: file.byteLength,
    },
  ]);
});

test("stops, naming the folder and the fault, when a listed plugin breaks the plugin contract", async () => {
  await assert.rejects(mount("bad"), (error: Error) => {
    assert.match(error.message, /plugins\/bad\//);
    assert.match(error.message, /description/);
    return true;
  });
});

test("stops, naming the deployment's index.ts, when its definition breaks the contract", async () => {
  await assert.rejects(mount("broken"), (error: Error) => {
    assert.match(
      error.message,
      /deployments\/broken\/index\.ts: The deployment cannot be read: deployment broken is invalid:\n- plugins /,
    );
    return true;
  });
});

test("stops, naming the skill, when a listed plugin has a skill that breaks the contract", async () => {
  await assert.rejects(mount("misnamed-skill"), (error: Error) => {
    assert.match(error.message, /^mount:/);
    assert.match(error.message, /skill nameless is invalid/);
    return true;
  });
});

test("stops, naming the folder, when a folder under skills/ has no SKILL.md", async () => {
  await assert.rejects(
    mount("fileless-skill"),
    /^Error: mount: .*fileless-skill cannot be read:\n- .*skills\/ghost\/SKILL\.md: The skill cannot be read: skills\/ghost has no SKILL\.md\./,
  );
});

test("a domain mounts when each name it uses is a mounted connector's op or skill", async () => {
  assert.deepEqual(names(await mount("uses-resolve")), ["source", "domain"]);
});

test("stops, naming the domain's skill and the name, when a domain's skill uses an op the deployment does not give, which its own check passes", async () => {
  await assert.doesNotReject(loadPlugin(join(fixtures, "plugins/stray")));
  await assert.rejects(
    mount("uses-unresolved"),
    /^Error: mount: deployment .*uses-unresolved breaks the harness schema:\n- .*plugins\/stray\/skills\/stray-guide\/SKILL\.md: \/uses: It points at source-lose, which is not a node\. \(basis\/link\)$/,
  );
});

// A plugin in a folder of its own, a root of its own: a definition with `fields`, and a skill, `<name>-guide`.
const written = async (name: string, fields: string) => {
  const dir = join(work, name);
  mkdirSync(join(dir, "io.github.matta-kelly.que"), { recursive: true });
  writeFileSync(
    join(dir, "io.github.matta-kelly.que/index.ts"),
    `import { definePlugin } from "@mku1tra/que-plugin";
export default definePlugin({ name: "${name}", type: "plugin", title: "${name}", description: "A plugin.", ${fields} });
`,
  );
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name, type: "module" }),
  );
  mkdirSync(join(dir, `skills/${name}-guide`), { recursive: true });
  writeFileSync(
    join(dir, `skills/${name}-guide/SKILL.md`),
    `---\nname: ${name}-guide\ndescription: How to use it.\n---\nUse it.\n`,
  );
  writeFileSync(join(dir, "basis.config.ts"), pluginConfig(name));
  return dir;
};

test("stops, naming both definitions, when two plugins list one capability", async () => {
  const capability = `capabilities: [{ name: "find-fabric", type: "capability", title: "Find a fabric", description: "Look one up." }]`;
  const dir = deploymentWith(["one", "two"], {
    one: await written("one", capability),
    two: await written("two", capability),
  });
  // Each problem is at its file's full path; the other piece it names is by its path from the root, the repo.
  const one = join(dir, "..", "plugins", "one");
  await assert.rejects(mountDeployment(dir), (error: Error) => {
    assert.ok(
      error.message.includes(
        `${one}/io.github.matta-kelly.que/index.ts#capabilities/find-fabric: The name find-fabric is also the name of plugins/two/io.github.matta-kelly.que/index.ts#capabilities/find-fabric. (basis/unique-name)`,
      ),
      error.message,
    );
    return true;
  });
});

test("check-plugin stops a plugin that uses its own skill", async () => {
  const dir = await written(
    "selfish",
    `kind: "domain", usesSkills: ["selfish-guide"]`,
  );
  await assert.rejects(
    mountPlugin(dir),
    /\/usesSkills: selfish-guide is its own: a plugin uses only other plugins' ops and skills\. \(plugin\/own-use\)/,
  );
});

test("stops, saying where que's files go, when a plugin's definition is at its root", async () => {
  await assert.rejects(mount("old-layout"), (error: Error) => {
    assert.match(
      error.message,
      /plugins\/old-layout: que's files are in io\.github\.matta-kelly\.que\/, not at the plugin's root/,
    );
    return true;
  });
});

test("stops, naming the folder, when a listed folder holds no plugin", async () => {
  await assert.rejects(mount("hollow"), (error: Error) => {
    assert.match(
      error.message,
      /plugins\/hollow holds no plugin \(no io\.github\.matta-kelly\.que\/index\.ts\)/,
    );
    return true;
  });
});

test("mounts a plugin whatever its folder's plugin.json holds, as no card is read", async () => {
  const dir = mkdtempSync(join(work, "carded-"));
  cpSync(join(fixtures, "plugins/gamma"), dir, { recursive: true });
  writeFileSync(join(dir, "plugin.json"), "not a card\n");
  assert.deepEqual(names([await mountPlugin(dir)]), ["gamma"]);
});

test("the template deployment mounts as a copy of it is, with no plugin", async () => {
  const dir = join(work, "my-deployment");
  cpSync(join(import.meta.dirname, "../../../../templates/deployment"), dir, {
    recursive: true,
  });
  const mounted = await mountDeployment(dir);
  assert.equal(mounted.name, "my-deployment");
  assert.deepEqual(mounted.plugins, []);
});

test("stops, naming the folder and saying how it gets one, when a deployment is in no root", async () => {
  const dir = mkdtempSync(join(work, "rootless-"));
  writeFileSync(join(dir, "index.ts"), bare("rootless"));
  await assert.rejects(mountDeployment(dir), (error: Error) => {
    assert.ok(error.message.startsWith(`mount: ${dir} is in no root:`));
    return true;
  });
});

test("each plugin a deployment mounts carries the card checkedCard makes of it", async () => {
  const plugins = join(fixtures, "plugins");
  const read = await Promise.all(
    ["source", "domain"].map((name) => readPlugin(join(plugins, name))),
  );
  assert.deepEqual(
    (await mount("uses-resolve")).map((plugin) => plugin.card),
    read.map((plugin) =>
      checkedCard(join(plugins, plugin.definition!.plugin.name), {
        ...plugin,
        definition: plugin.definition!,
      }),
    ),
  );
});

test("stops, naming the plugin, when its card breaks the standard", async () => {
  const dir = needing("*");
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "beta", type: "module", version: 6 }),
  );
  await assert.rejects(mountPlugin(dir), (error: Error) => {
    assert.match(error.message, /the card of beta breaks Agent Plugins 1\.0:/);
    assert.match(error.message, /\/version must be string/);
    return true;
  });
});

test("stops, naming the root, when the root that holds a deployment gives no deployment of its name", async () => {
  const repo = mkdtempSync(join(work, "other-"));
  writeFileSync(
    join(repo, "basis.config.ts"),
    `import { defineSchema } from "@mku1tra/basis";
import { harness } from "@mku1tra/que-harness";
export default {
  schema: defineSchema({ name: "other", description: "A root that gives no deployment.", types: {}, imports: [harness], notes: new URL("./", import.meta.url) }),
};
`,
  );
  writeFileSync(join(repo, "package.json"), '{ "type": "module" }\n');
  const dir = join(repo, "lonely");
  mkdirSync(dir);
  writeFileSync(join(dir, "index.ts"), bare("lonely"));
  await assert.rejects(mountDeployment(dir), (error: Error) => {
    assert.match(
      error.message,
      /^mount: the root .* gives no deployment lonely/,
    );
    return true;
  });
});
