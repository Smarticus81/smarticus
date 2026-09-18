import OpenAI from "openai";
import { env } from "../config/env.js";

let client: OpenAI | null = null;

export type VectorFileAttributes = Record<string, string | number | boolean>;

export function getOpenAI(): OpenAI {
  if (!client) {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return client;
}

export interface LiveSessionRequest {
  sdp: string;
  safetyIdentifier: string;
  voiceInstructions: string;
  backendInstructions: string;
  /**
   * Text-only history seeded before the session starts: today's schedule, the
   * learner's open threads and recent feedback. It gives the speaking model the
   * same day the reasoning backend has, and unlike a developer note mid-session
   * it does not spend any of the backend's bounded input history.
   */
  initialInput?: Array<{
    type: "message";
    role: "developer";
    content: Array<{ type: "input_text"; text: string }>;
  }>;
  tools: Array<{
    type: "function";
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    strict: true;
  }>;
}

/**
 * Create a GPT-Live WebRTC session. The browser's SDP offer is answered by
 * OpenAI; the full-duplex voice model handles conversation and delegates
 * reasoning, tools, vision, and whiteboard work to the configured backend model.
 */
export async function createLiveSession(params: LiveSessionRequest) {
  const openai = getOpenAI();
  const created = await openai.live.create(
    {
      session: {
        model: env.REALTIME_MODEL,
        instructions: params.voiceInstructions,
        audio: { output: { voice: env.REALTIME_VOICE } },
        ...(params.initialInput?.length ? { input: params.initialInput } : {}),
        delegation: {
          type: "responses",
          responses: {
            model: env.LIVE_BACKEND_MODEL,
            instructions: params.backendInstructions,
            tools: [...params.tools, { type: "web_search" }],
            tool_choice: "auto",
            parallel_tool_calls: true,
            reasoning: { effort: env.LIVE_BACKEND_REASONING },
            text: { verbosity: "low" },
            max_output_tokens: 1_600,
          },
        },
        store: false,
      },
      transport: { type: "webrtc", sdp: params.sdp },
    },
    { headers: { "OpenAI-Safety-Identifier": params.safetyIdentifier } },
  );
  return {
    sessionId: created.session.id,
    sdp: created.transport.sdp,
    voiceModel: env.REALTIME_MODEL,
    backendModel: env.LIVE_BACKEND_MODEL,
    voice: env.REALTIME_VOICE,
  };
}

export async function searchVectorStore(params: {
  query: string;
  maxResults?: number;
  filters?: unknown;
}) {
  if (!env.OPENAI_VECTOR_STORE_ID) {
    return { data: [], message: "Vector store not configured" };
  }

  const openai = getOpenAI();
  const response = await openai.vectorStores.search(env.OPENAI_VECTOR_STORE_ID, {
    query: params.query,
    max_num_results: params.maxResults ?? 10,
    ...(params.filters ? { filters: params.filters as never } : {}),
  });

  return response;
}

export async function searchWeb(query: string) {
  const response = await getOpenAI().responses.create({
    model: env.WEB_SEARCH_MODEL,
    instructions:
      "Answer for a Grade 6 student in clear, accurate language an 11-to-12-year-old can follow: everyday words, short sentences, and a quick plain-language meaning for any technical term you need. Use live web search when it improves accuracy or freshness. Distinguish established facts from uncertainty, avoid unsafe or age-inappropriate detail, and never fabricate sources.",
    input: query,
    tools: [{ type: "web_search", external_web_access: true }],
    tool_choice: "auto",
    include: ["web_search_call.action.sources"],
    max_output_tokens: 1_200,
    store: false,
  });

  const sources = new Set<string>();
  for (const item of response.output) {
    if (item.type !== "web_search_call") continue;
    if (item.action.type === "search") {
      for (const source of item.action.sources ?? []) sources.add(source.url);
    } else if ("url" in item.action && item.action.url) {
      sources.add(item.action.url);
    }
  }

  return {
    answer: response.output_text,
    sources: [...sources],
  };
}

export async function uploadFileToVectorStore(params: {
  filename: string;
  content: Buffer | Blob;
  purpose?: "assistants";
  attributes?: VectorFileAttributes;
}) {
  const openai = getOpenAI();
  const file = await openai.files.create({
    file: new File([params.content], params.filename),
    purpose: params.purpose ?? "assistants",
  });

  if (!env.OPENAI_VECTOR_STORE_ID) {
    return { fileId: file.id, vectorStoreFileId: null };
  }

  const vsFile = await openai.vectorStores.files.create(env.OPENAI_VECTOR_STORE_ID, {
    file_id: file.id,
    ...(params.attributes ? { attributes: params.attributes as never } : {}),
  });

  return { fileId: file.id, vectorStoreFileId: vsFile.id };
}

export async function removeVectorStoreFile(vectorStoreFileId: string | null | undefined) {
  if (!vectorStoreFileId || !env.OPENAI_VECTOR_STORE_ID || !env.OPENAI_API_KEY) return;

  const response = await fetch(
    `https://api.openai.com/v1/vector_stores/${encodeURIComponent(env.OPENAI_VECTOR_STORE_ID)}/files/${encodeURIComponent(vectorStoreFileId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    },
  );

  // A missing old attachment is already effectively removed, so treat 404 as success.
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Failed to remove old vector store file: ${response.status} ${text}`);
  }
}

export async function pollVectorStoreFileStatus(vectorStoreFileId: string, maxAttempts = 30) {
  if (!env.OPENAI_VECTOR_STORE_ID) return "completed";

  const openai = getOpenAI();
  for (let i = 0; i < maxAttempts; i++) {
    const file = await openai.vectorStores.files.retrieve(vectorStoreFileId, {
      vector_store_id: env.OPENAI_VECTOR_STORE_ID,
    });
    if (file.status === "completed") return "completed";
    if (file.status === "failed" || file.status === "cancelled") return file.status;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return "pending";
}
