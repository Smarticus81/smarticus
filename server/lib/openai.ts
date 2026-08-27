import OpenAI from "openai";
import { env } from "../config/env.js";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!client) {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return client;
}

export async function mintRealtimeClientSecret(params: {
  safetyIdentifier: string;
  instructions: string;
  tools?: unknown[];
}) {
  const openai = getOpenAI();
  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": params.safetyIdentifier,
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: env.REALTIME_MODEL,
        instructions: params.instructions,
        audio: {
          output: { voice: env.REALTIME_VOICE },
        },
        tools: params.tools,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to mint client secret: ${response.status} ${text}`);
  }

  return response.json() as Promise<{ value: string }>;
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

export async function uploadFileToVectorStore(params: {
  filename: string;
  content: Buffer | Blob;
  purpose?: "assistants";
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
  });

  return { fileId: file.id, vectorStoreFileId: vsFile.id };
}

export async function pollVectorStoreFileStatus(vectorStoreFileId: string, maxAttempts = 30) {
  if (!env.OPENAI_VECTOR_STORE_ID) return "completed";

  const openai = getOpenAI();
  for (let i = 0; i < maxAttempts; i++) {
    const file = await openai.vectorStores.files.retrieve(env.OPENAI_VECTOR_STORE_ID, vectorStoreFileId);
    if (file.status === "completed") return "completed";
    if (file.status === "failed" || file.status === "cancelled") return file.status;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return "pending";
}
