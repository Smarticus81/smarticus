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

/** Most characters a screen description may run to: it rides in a tool output of about 1.5KB. */
export const SCREEN_DESCRIPTION_MAX_CHARS = 700;

export const SCREEN_DESCRIPTION_INSTRUCTIONS =
  "You are the eyes of a voice tutor helping a Grade 6 student who has shared his screen. Describe what is on it so the tutor can help without seeing it. Name the program (for example Blender, a browser tab, a file window). Then, in order of use to the tutor: the question asked, any dialog, error or warning text word for word, which mode, tab or menu is open, the selected or named object and any visible values with their labels, and what the student seems to be in the middle of. Plain words, no greeting, no advice, no guesses about what is off-screen; say so if the picture is blurred or too small to read. At most 90 words.";

export interface ScreenDescriptionRequest {
  /** JPEG, PNG or WebP data URL. */
  image: string;
  surface: "monitor" | "window" | "browser" | "unknown";
  question: string | null;
}

/** The text sent beside the picture: what is shared and what the tutor asked. */
export function screenDescriptionPrompt(params: Omit<ScreenDescriptionRequest, "image">): string {
  const surface =
    params.surface === "monitor"
      ? "The student is sharing his whole screen."
      : params.surface === "window"
        ? "The student is sharing one program window."
        : params.surface === "browser"
          ? "The student is sharing only his browser tab with the lesson in it."
          : "The student is sharing his screen.";
  const question = params.question?.trim();
  return question
    ? `${surface} The tutor wants to know: ${question}`
    : `${surface} Describe what matters most on it.`;
}

/** Trim a description to the characters a tool output can carry, on a word. */
export function clipDescription(text: string, maxChars = SCREEN_DESCRIPTION_MAX_CHARS): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars - 1);
  const space = cut.lastIndexOf(" ");
  return `${space > maxChars / 2 ? cut.slice(0, space) : cut}…`;
}

/**
 * Put one frame of the shared screen into words.
 *
 * The voice session's delegated backend cannot take a picture (its whole input
 * history is smaller than one), so the frame goes to a vision model here and
 * only the words go back into the session.
 */
export async function describeScreen(params: ScreenDescriptionRequest): Promise<string> {
  const response = await getOpenAI().responses.create({
    model: env.SCREEN_VISION_MODEL,
    instructions: SCREEN_DESCRIPTION_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: screenDescriptionPrompt(params) },
          { type: "input_image", image_url: params.image, detail: "high" },
        ],
      },
    ],
    max_output_tokens: 320,
    store: false,
  });
  const text = response.output_text?.trim();
  if (!text) throw new Error("The vision model returned no description.");
  return clipDescription(text);
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
