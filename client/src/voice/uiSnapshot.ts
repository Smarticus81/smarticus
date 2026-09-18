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
  /**
   * Trim the bulky, low-signal sections (surrounding prose, control lists) while
   * keeping the lines that matter: the question, the learner's own writing, and
   * the caller's extras. Used where the backend's bounded input history is paying
   * for every byte, so that a hard truncation never eats the important tail.
   */
  compact?: boolean;
}

export function captureUiSnapshot(options: UiSnapshotOptions = {}): string {
  const root = options.root ?? document;
  const compact = options.compact ?? false;
  const maxChars = options.maxChars ?? (compact ? 2_000 : 6_000);
  const limit = <T,>(list: T[], full: number) => list.slice(0, compact ? Math.ceil(full / 3) : full);
  const lines: string[] = [];
  const page = new URLSearchParams(window.location.search).get("view") ?? "today";
  lines.push(`Page: ${page}. Viewport ${window.innerWidth}×${window.innerHeight}, scrolled ${Math.round(window.scrollY)}px.`);

  const header = root.querySelector(".zen-lesson-header");
  if (header) {
    lines.push(
      `Lesson: ${clean(header.querySelector("h1")?.textContent, 160)} — ${clean(header.querySelector("p")?.textContent, 160)}`,
    );
  }
  // The studio shows Virgil and the shared board; the lesson itself lives
  // behind a menu. Reporting the menu's state matters as much as its contents:
  // without it the tutor would describe a question the learner cannot see.
  const menu = root.querySelector("#lesson-menu");
  const menuOpen = menu instanceof HTMLElement && !menu.hidden;
  if (menu) {
    lines.push(
      menuOpen
        ? "Lesson menu: OPEN over the stage, so the lesson section below is what he is reading."
        : "Lesson menu: CLOSED. On screen right now are Virgil and the shared board only. The lesson section and question below are still where he left them, one tap away behind the Lesson button, but he is not looking at them.",
    );
  }
  const stageFocus = root.querySelector(".studio-now");
  if (stageFocus) lines.push(`On the stage: ${clean(stageFocus.textContent, 220)}`);
  const section = root.querySelector(".journey-nav button[aria-current='step']");
  if (section) lines.push(`Open section: ${clean(section.textContent, 60)}.`);

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
  const fieldValue = (field: Element) =>
    field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement ? field.value : "";
  // What the learner has actually written is the most valuable thing on screen,
  // so compact mode keeps every field with content and sheds the empty ones.
  const shown = compact
    ? [...fields.filter((field) => fieldValue(field).trim()), ...fields.filter((field) => !fieldValue(field).trim())].slice(0, 4)
    : fields.slice(0, 6);
  for (const field of shown) {
    const value = fieldValue(field);
    const status = value.trim() ? `"${clean(value, compact ? 500 : 1_200)}"` : "(empty)";
    lines.push(`Field "${labelFor(field)}": ${status}`);
  }

  const main = root.querySelector(".lesson-main") ?? root.querySelector("main") ?? document.body;
  const headings = [...main.querySelectorAll("h2, h3")].filter((heading) => visible(heading) && inViewport(heading));
  if (headings.length) {
    lines.push(`Visible headings: ${limit(headings, 8).map((heading) => clean(heading.textContent, compact ? 60 : 90)).join(" | ")}`);
  }
  const model = root.querySelector(".model-card");
  if (model && visible(model)) {
    lines.push(`Interactive model on screen: ${clean(model.textContent, compact ? 220 : 700)}`);
  }
  const reading = [...main.querySelectorAll("p")].filter((paragraph) => visible(paragraph) && inViewport(paragraph));
  if (reading.length) {
    lines.push(`Visible text: ${limit(reading, 6).map((paragraph) => clean(paragraph.textContent, compact ? 140 : 260)).join(" ¶ ")}`);
  }

  const buttons = [...root.querySelectorAll("button")].filter(
    (button) => visible(button) && inViewport(button) && !button.disabled,
  );
  if (buttons.length) {
    const names = [...new Set(buttons.map((button) => labelFor(button)).filter(Boolean))];
    lines.push(`Available controls: ${limit(names, 18).join(", ")}.`);
  }

  const active = document.activeElement;
  if (active && active !== document.body) {
    lines.push(`Focused control: ${active.tagName.toLowerCase()} "${labelFor(active)}".`);
  }
  const selection = clean(window.getSelection()?.toString(), 300);
  if (selection) lines.push(`Highlighted text: "${selection}"`);

  const utterance = root.querySelector(".live-utterance p");
  if (utterance) lines.push(`Virgil's latest words on screen: "${clean(utterance.textContent, compact ? 120 : 300)}"`);
  const status = root.querySelector(".voice-hud");
  if (status) lines.push(`Voice status: ${clean(status.textContent, 80)}.`);

  for (const line of options.extra ?? []) if (line) lines.push(line);

  let text = lines.join("\n");
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}…`;
  return text;
}
