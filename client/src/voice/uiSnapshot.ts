/**
 * Describe what the learner currently sees so the tutor can reason about the
 * real interface state instead of guessing. Output is compact text for a
 * language model; it never includes hidden answer keys because they are not in
 * the DOM.
 */

function visible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hidden || element.closest("[hidden], [aria-hidden='true']")) return false;
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return element.getClientRects().length > 0;
}

function inViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
}

function clean(text: string | null | undefined, max = 400): string {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function labelFor(element: Element): string {
  const aria = element.getAttribute("aria-label");
  if (aria) return clean(aria, 160);
  const id = element.getAttribute("id");
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label) return clean(label.textContent, 160);
  }
  const placeholder = element.getAttribute("placeholder");
  if (placeholder) return clean(placeholder, 120);
  return clean(element.textContent, 120);
}

export interface UiSnapshotOptions {
  root?: ParentNode;
  maxChars?: number;
  /** Extra lines appended by the caller, e.g. whiteboard contents. */
  extra?: string[];
}

export function captureUiSnapshot(options: UiSnapshotOptions = {}): string {
  const root = options.root ?? document;
  const maxChars = options.maxChars ?? 6_000;
  const lines: string[] = [];
  const page = new URLSearchParams(window.location.search).get("view") ?? "today";
  lines.push(`Page: ${page}. Viewport ${window.innerWidth}×${window.innerHeight}, scrolled ${Math.round(window.scrollY)}px.`);

  const header = root.querySelector(".zen-lesson-header");
  if (header) {
    lines.push(
      `Lesson: ${clean(header.querySelector("h1")?.textContent, 160)} — ${clean(header.querySelector("p")?.textContent, 160)}`,
    );
  }
  const section = root.querySelector(".journey-nav button[aria-current='step']");
  if (section) lines.push(`Open section: ${clean(section.textContent, 60)}.`);
  if (root.querySelector(".focus-mode")) lines.push("Quiet focus mode is on (companion panel hidden).");

  const currentQuestion = root.querySelector(".question-map button[aria-current='step']");
  if (currentQuestion) {
    const total = root.querySelectorAll(".question-map button").length;
    lines.push(`Selected practice item: ${clean(currentQuestion.getAttribute("aria-label"), 120)} of ${total}.`);
    const started = [...root.querySelectorAll(".question-map button.has-draft")].map((button) =>
      clean(button.textContent, 4),
    );
    if (started.length) lines.push(`Questions with drafts started: ${started.join(", ")}.`);
  }
  const focusedQuestion = root.querySelector(".focused-question");
  if (focusedQuestion) {
    lines.push(`Question group: ${clean(focusedQuestion.querySelector(".question-group")?.textContent, 60)}.`);
    lines.push(`Question prompt: ${clean(focusedQuestion.querySelector("h3")?.textContent, 800)}`);
  }

  const fields = [...root.querySelectorAll("textarea, input[type='text'], input[type='number']")].filter(visible);
  for (const field of fields.slice(0, 6)) {
    const value = field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement ? field.value : "";
    const status = value.trim() ? `"${clean(value, 1_200)}"` : "(empty)";
    lines.push(`Field "${labelFor(field)}": ${status}`);
  }

  const main = root.querySelector(".lesson-main") ?? root.querySelector("main") ?? document.body;
  const headings = [...main.querySelectorAll("h2, h3")].filter((heading) => visible(heading) && inViewport(heading));
  if (headings.length) {
    lines.push(`Visible headings: ${headings.slice(0, 8).map((heading) => clean(heading.textContent, 90)).join(" | ")}`);
  }
  const model = root.querySelector(".model-card");
  if (model && visible(model)) {
    lines.push(`Interactive model on screen: ${clean(model.textContent, 700)}`);
  }
  const reading = [...main.querySelectorAll("p")].filter((paragraph) => visible(paragraph) && inViewport(paragraph));
  if (reading.length) {
    lines.push(`Visible text: ${reading.slice(0, 6).map((paragraph) => clean(paragraph.textContent, 260)).join(" ¶ ")}`);
  }

  const buttons = [...root.querySelectorAll("button")].filter(
    (button) => visible(button) && inViewport(button) && !button.disabled,
  );
  if (buttons.length) {
    const names = [...new Set(buttons.map((button) => labelFor(button)).filter(Boolean))];
    lines.push(`Available controls: ${names.slice(0, 18).join(", ")}.`);
  }

  const active = document.activeElement;
  if (active && active !== document.body) {
    lines.push(`Focused control: ${active.tagName.toLowerCase()} "${labelFor(active)}".`);
  }
  const selection = clean(window.getSelection()?.toString(), 300);
  if (selection) lines.push(`Highlighted text: "${selection}"`);

  const utterance = root.querySelector(".live-utterance p");
  if (utterance) lines.push(`Virgil's latest words on screen: "${clean(utterance.textContent, 300)}"`);
  const status = root.querySelector(".voice-hud");
  if (status) lines.push(`Voice status: ${clean(status.textContent, 80)}.`);

  for (const line of options.extra ?? []) if (line) lines.push(line);

  let text = lines.join("\n");
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}…`;
  return text;
}

/** Short version for silent context notes (kept under ~500 tokens). */
export function captureUiNote(options: UiSnapshotOptions = {}): string {
  return captureUiSnapshot({ ...options, maxChars: options.maxChars ?? 1_400 });
}
