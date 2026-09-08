import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, type ReactNode } from "react";

export function Scene({ id, children }: { id: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={id}
        initial={{ opacity: 0, y: reduced ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduced ? 0 : -5 }}
        transition={{ duration: reduced ? 0 : 0.18 }}
        className="learning-scene"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
export function JournalPrompt({
  label,
  value,
  onChange,
  placeholder = "An idea is a good place to start…",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="journal-prompt">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        placeholder={placeholder}
      />
    </div>
  );
}
export function ChoiceGroup({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: string[];
  selected: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="learning-choices">
      <legend>{label}</legend>
      <div>
        {values.map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={value === selected}
            onClick={() => onChange(value)}
          >
            {value}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
export function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="learning-range">
      <label htmlFor={id}>
        {label}
        <output>
          {value}
          {suffix}
        </output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div>
        <span>
          {min}
          {suffix}
        </span>
        <span>
          {max}
          {suffix}
        </span>
      </div>
    </div>
  );
}
