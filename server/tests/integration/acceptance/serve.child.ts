/**
 * One process of que's server for the acceptance test: on the database
 * DATABASE_URL, the data directory QUE_DATA_DIR and the fixture deployment
 * "acceptance", signed in as DEV_USER_EMAIL, with pi-ai's scripted provider
 * (`faux`) in the place of Fireworks. The model is registered under the
 * catalog id the deployment names, whose entry takes text and images, so a
 * run can see an image.
 *
 * Two routes of the test's own:
 *
 * - `POST /__faux` with `{ steps }` sets the next run's model responses and
 *   clears the recorded requests.
 * - `GET /__requests` gives each model request's messages, as the run made
 *   them, so the test reads the transcript the model was given.
 */

import { serve } from "@hono/node-server";
import type { JsonObject, Message } from "@earendil-works/pi-ai";
import {
  fauxAssistantMessage,
  fauxProvider,
  type FauxResponseFactory,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";

type Step =
  | { tool: { name: string; arguments: JsonObject; id: string } }
  | { text: string };

const { app } = await import("../../../runtime/src/serve.js");
const { models } = await import("../../../runtime/src/runner/pi/harness.js");

const faux = fauxProvider({
  provider: "fireworks",
  models: [
    {
      id: "accounts/fireworks/models/glm-5p3-flash",
      input: ["text", "image"],
      contextWindow: 202_752,
      maxTokens: 16_384,
    },
  ],
});
models.setProvider(faux.provider);

let steps: Step[] = [];
const requests: Message[][] = [];

const respond: FauxResponseFactory = (context) => {
  requests.push(structuredClone(context.messages));
  const step = steps.shift();
  if (!step) throw new Error("the acceptance test scripted no response left");
  if ("tool" in step)
    return fauxAssistantMessage(
      [
        fauxToolCall(step.tool.name, step.tool.arguments, {
          id: step.tool.id,
        }),
      ],
      { stopReason: "toolUse" },
    );
  return fauxAssistantMessage(fauxText(step.text));
};

// One scripted response per model request of every run in this process.
faux.setResponses(Array.from({ length: 200 }, () => respond));

app.post("/__faux", async (c) => {
  steps = ((await c.req.json()) as { steps: Step[] }).steps;
  requests.length = 0;
  return c.json({ ok: true });
});

app.get("/__requests", (c) => c.json(requests));

serve({ fetch: app.fetch, port: Number(process.env.PORT) });
