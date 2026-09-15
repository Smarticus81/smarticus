import { useEffect, useRef } from "react";
import { Icon } from "../components/Icon";
import { reader, useReader } from "./readerStore";

/**
 * The shared reading panel. Everything rendered here is plain text and image
 * URLs the server already extracted, so a page Virgil opens can never run code
 * or style itself into the app.
 */
export function Reader({ onClose }: { onClose: () => void }) {
  const state = useReader();
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // A newly opened page should start at the top, not wherever the last one sat.
  useEffect(() => {
    if (state.page) bodyRef.current?.scrollTo({ top: 0 });
  }, [state.page?.url]);

  return (
    <section className="reader-panel" data-testid="reader" aria-label="Shared reading panel">
      <header className="reader-head">
        <div className="reader-title">
          <span className="reader-site">{state.page?.site ?? "Reading together"}</span>
          <h3>{state.loading ? "Opening a page…" : (state.page?.title ?? "Nothing open yet")}</h3>
        </div>
        <div className="reader-actions">
          {state.page && (
            <a
              className="button ghost small"
              href={state.page.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              Open the real page
            </a>
          )}
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close the reading panel">
            <Icon name="close" />
          </button>
        </div>
      </header>

      <div className="reader-body" ref={bodyRef}>
        {state.loading && (
          <p className="reader-status" role="status">
            {state.purpose ? `Virgil is looking up ${state.purpose}…` : "Virgil is opening a page…"}
          </p>
        )}
        {state.error && !state.loading && (
          <p className="reader-status error" role="alert">
            {state.error}
          </p>
        )}
        {state.page && !state.loading && (
          <article>
            {state.page.byline && <p className="reader-byline">{state.page.byline}</p>}
            {state.page.images[0] && (
              <img
                className="reader-image"
                src={state.page.images[0].src}
                alt={state.page.images[0].alt || ""}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            )}
            {state.page.blocks.map((block, index) =>
              block.type === "heading" ? (
                <h4 key={index}>{block.text}</h4>
              ) : block.type === "quote" ? (
                <blockquote key={index}>{block.text}</blockquote>
              ) : block.type === "list_item" ? (
                <li key={index}>{block.text}</li>
              ) : (
                <p key={index}>{block.text}</p>
              ),
            )}
            {state.page.truncated && <p className="reader-status">Only the first part of this page is shown.</p>}
          </article>
        )}
      </div>
    </section>
  );
}

export { reader };
