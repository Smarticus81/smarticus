/**
 * Create or update the ElevenLabs "Virgil" agent the third voice fallback uses.
 *
 *   ELEVENLABS_API_KEY=... npm run elevenlabs:agent
 *
 * With ELEVENLABS_AGENT_ID set, that agent is updated in place; without it a
 * new one is created and its id printed for the environment. Either way the
 * studio's tool catalog is registered as client tools (created or updated by
 * name) and attached to the agent, the audio formats are set to the browser's
 * rates, and per-conversation overrides are switched on so each session can
 * carry the day's instructions.
 */
import "dotenv/config";
import { env } from "../server/config/env.js";
import {
  ELEVENLABS_API_ORIGIN,
  elevenLabsAgentConfig,
  elevenLabsToolConfigs,
} from "../server/lib/elevenlabs.js";

interface ListedTool {
  id: string;
  tool_config?: { name?: string };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(new URL(path, ELEVENLABS_API_ORIGIN), {
    method,
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY ?? "",
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (HTTP ${response.status}): ${text.slice(0, 1_000)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

async function main() {
  if (!env.ELEVENLABS_API_KEY) {
    throw new Error("Set ELEVENLABS_API_KEY before running this script.");
  }

  const listed = await request<{ tools?: ListedTool[] }>("GET", "/v1/convai/tools");
  const existing = new Map(
    (listed.tools ?? [])
      .filter((tool) => tool.tool_config?.name)
      .map((tool) => [tool.tool_config!.name!, tool.id] as const),
  );

  const toolIds: string[] = [];
  for (const toolConfig of elevenLabsToolConfigs()) {
    const name = toolConfig.name as string;
    const id = existing.get(name);
    if (id) {
      await request("PATCH", `/v1/convai/tools/${id}`, { tool_config: toolConfig });
      console.log(`updated tool ${name} (${id})`);
      toolIds.push(id);
    } else {
      const created = await request<{ id: string }>("POST", "/v1/convai/tools", {
        tool_config: toolConfig,
      });
      console.log(`created tool ${name} (${created.id})`);
      toolIds.push(created.id);
    }
  }

  const agent = elevenLabsAgentConfig(toolIds);
  if (env.ELEVENLABS_AGENT_ID) {
    await request("PATCH", `/v1/convai/agents/${env.ELEVENLABS_AGENT_ID}`, agent);
    console.log(`updated agent ${env.ELEVENLABS_AGENT_ID}`);
  } else {
    const created = await request<{ agent_id: string }>("POST", "/v1/convai/agents/create", agent);
    console.log(`created agent ${created.agent_id}`);
    console.log(`\nAdd this to your environment:\nELEVENLABS_AGENT_ID=${created.agent_id}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
