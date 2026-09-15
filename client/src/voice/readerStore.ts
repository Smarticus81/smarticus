import { useSyncExternalStore } from "react";

export interface ReaderImage {
  src: string;
  alt: string;
}

export interface ReaderBlock {
  type: "heading" | "paragraph" | "list_item" | "quote";
  text: string;
}

export interface ReaderPage {
  url: string;
  site: string;
  title: string;
  byline: string | null;
  blocks: ReaderBlock[];
  images: ReaderImage[];
  truncated: boolean;
}

export interface ReaderState {
  open: boolean;
  loading: boolean;
  page: ReaderPage | null;
  /** What Virgil said she was looking for, shown while the page loads. */
  purpose: string | null;
  error: string | null;
  version: number;
}

type Listener = () => void;

/**
 * The shared reading panel. Virgil opens a page here so she and the learner are
 * looking at the same thing; the page arrives already fetched and stripped of
 * markup by the server, so nothing from the open web executes in the app.
 */
class ReaderStore {
  private state: ReaderState = {
    open: false,
    loading: false,
    page: null,
    purpose: null,
    error: null,
    version: 0,
  };
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;

  private commit(patch: Partial<ReaderState>) {
    this.state = { ...this.state, ...patch, version: this.state.version + 1 };
    for (const listener of this.listeners) listener();
  }

  /** Show the panel in its loading state while the fetch is in flight. */
  beginLoad(purpose: string | null) {
    this.commit({ open: true, loading: true, error: null, purpose });
  }

  show(page: ReaderPage) {
    this.commit({ open: true, loading: false, page, error: null });
  }

  fail(message: string) {
    this.commit({ open: true, loading: false, error: message });
  }

  close() {
    this.commit({ open: false, loading: false, purpose: null });
  }

  /** Short description of what is on screen, for look_at_screen. */
  summary(): string {
    const { open, page, loading, error } = this.state;
    if (!open) return "The reading panel is closed.";
    if (loading) return "The reading panel is loading a page.";
    if (error) return `The reading panel failed to open a page: ${error}`;
    if (!page) return "The reading panel is open but empty.";
    const heading = page.blocks.find((block) => block.type === "heading")?.text;
    return `Reading panel open: "${page.title}" from ${page.site}${heading ? ` — section "${heading}"` : ""}, ${page.blocks.length} passages${page.images.length ? ` and ${page.images.length} pictures` : ""}.`;
  }
}

export const reader = new ReaderStore();

export function useReader(): ReaderState {
  return useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot);
}
