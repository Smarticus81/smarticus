import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { motion } from "motion/react";
import type { LessonView } from "../../lib/types";
import {
  accuracy,
  activityFor,
  lightAppearance,
  lightColors,
  percentPart,
  reflectedLight,
  transmittedLight,
} from "../../lib/learning";
import { ChoiceGroup, JournalPrompt, Range, Scene } from "./LearningPrimitives";
import { LightLab } from "../DiscoveryLab";

const ModelContext = createContext<(context: string) => void>(() => undefined);
function useModelContext(context: string) {
  const report = useContext(ModelContext);
  useEffect(() => report(context), [context, report]);
}

type Journal = {
  entries: Record<string, string>;
  write: (key: string, value: string) => void;
};
export function LessonActivities({
  lesson,
  journal,
  onFocus,
  onDiscuss,
}: {
  lesson: LessonView;
  journal: Journal;
  onFocus: (context: string) => void;
  onDiscuss: (context: string) => void;
}) {
  const modelContext = useRef("");
  const report = useCallback(
    (context: string) => {
      modelContext.current = context;
      onFocus("Exploring " + lesson.lesson_title + ". " + context);
    },
    [onFocus, lesson.lesson_title],
  );
  const kind = activityFor(lesson);
  return (
    <ModelContext.Provider value={report}>
      <div className="lesson-activity">
        <div className="activity-intro">
          <span className="eyebrow">A LITTLE SPACE TO EXPERIMENT</span>
          <h2>What happens if…</h2>
          <p>Make a prediction. Change one thing. Look for the reason.</p>
        </div>
        <div className="activity-context">
          <span>Connected to your lesson</span>
          <strong>{lesson.lesson_title}</strong>
        </div>
        {kind === "percent" ? (
          <PercentStudio />
        ) : kind === "ratio" ? (
          <RatioStudio />
        ) : kind === "fractions" ? (
          <FractionStudio />
        ) : kind === "color" ? (
          <ColorStudio />
        ) : kind === "reflection" ? (
          <LightLab />
        ) : kind === "materials" ? (
          <MaterialsStudio />
        ) : kind === "french" ? (
          <FrenchStudio lesson={lesson} />
        ) : kind === "evaluation" ? (
          <EvaluationStudio />
        ) : kind === "algorithm" ? (
          <AlgorithmStudio />
        ) : kind === "evidence" ? (
          <EvidenceStudio lesson={lesson} journal={journal} />
        ) : (
          <ConnectionStudio lesson={lesson} journal={journal} />
        )}
        <JournalPrompt
          label="What changed? What stayed the same? Why?"
          value={journal.entries.discovery ?? ""}
          onChange={(value) => journal.write("discovery", value)}
        />
        <button
          className="text-button"
          onClick={() =>
            onDiscuss(
              "Exploring " +
                lesson.lesson_title +
                ". " +
                modelContext.current +
                "\nMy observation: " +
                (journal.entries.discovery || "I am still exploring."),
            )
          }
        >
          Talk through my discovery with Virgil ↗
        </button>
        <p className="learning-fineprint">
          This is an exploration space. Your assigned questions are in Practice.
        </p>
      </div>
    </ModelContext.Provider>
  );
}

function PercentStudio() {
  const [whole, setWhole] = useState(80);
  const [percent, setPercent] = useState(25);
  const [unknown, setUnknown] = useState("Part");
  const [prediction, setPrediction] = useState("");
  const [checked, setChecked] = useState(false);
  const part = percentPart(whole, percent);
  useModelContext(
    "Percent model: whole " +
      whole +
      ", percent " +
      percent +
      ", part " +
      part +
      ". Missing-number mode: " +
      unknown +
      ". Prediction: " +
      prediction,
  );
  const target =
    unknown === "Part" ? part : unknown === "Percent" ? percent : whole;
  const correct =
    prediction.trim() !== "" && Math.abs(Number(prediction) - target) < 0.001;
  const reset = () => {
    setChecked(false);
    setPrediction("");
  };
  return (
    <section className="model-card percent-studio">
      <div className="model-heading">
        <span className="eyebrow">THE PERCENT LAB</span>
        <h3>Three numbers. One relationship.</h3>
        <p>
          Each tile is 1% of the whole. Move a slider to see the connection.
        </p>
      </div>
      <div className="percent-model">
        <div
          className="hundred-grid"
          role="img"
          aria-label={`${percent} of 100 tiles selected; ${percent}% of ${whole} is ${part}`}
        >
          {Array.from({ length: 100 }, (_, i) => (
            <motion.span
              key={i}
              animate={{
                backgroundColor: i < percent ? "#637955" : "#e6e9df",
                scale: i < percent ? 1 : 0.85,
              }}
              transition={{ duration: 0.18 }}
            />
          ))}
        </div>
        <div className="percent-equation">
          <span>PART</span>
          <strong>{part}</strong>
          <i>out of</i>
          <span>WHOLE</span>
          <strong>{whole}</strong>
          <i>is</i>
          <span>PERCENT</span>
          <strong>
            {percent}
            <small>%</small>
          </strong>
        </div>
      </div>
      <div className="model-controls">
        <Range
          label="Whole"
          value={whole}
          min={20}
          max={200}
          step={5}
          onChange={(value) => {
            setWhole(value);
            reset();
          }}
        />
        <Range
          label="Percent"
          value={percent}
          min={5}
          max={100}
          step={5}
          suffix="%"
          onChange={(value) => {
            setPercent(value);
            reset();
          }}
        />
      </div>
      <div className="model-insight">
        <strong>
          {whole} ÷ 100 = {whole / 100} per tile.
        </strong>
        <p>
          {percent} tiles × {whole / 100} = {part}. Changing the whole changes
          what each 1% is worth.
        </p>
      </div>
      <details className="model-challenge">
        <summary>Try finding a missing number</summary>
        <ChoiceGroup
          label="Which number will you find?"
          values={["Part", "Percent", "Whole"]}
          selected={unknown}
          onChange={(value) => {
            setUnknown(value);
            reset();
          }}
        />
        <p>
          {unknown === "Part"
            ? `What is ${percent}% of ${whole}?`
            : unknown === "Percent"
              ? `${part} is what percent of ${whole}?`
              : `${part} is ${percent}% of what whole?`}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setChecked(true);
          }}
        >
          <label className="sr-only" htmlFor="percent-prediction">
            Your missing number
          </label>
          <input
            id="percent-prediction"
            inputMode="decimal"
            value={prediction}
            onChange={(event) => {
              setPrediction(event.target.value);
              setChecked(false);
            }}
            placeholder="Your number"
          />
          <button className="button dark" disabled={!prediction.trim()}>
            Check my thinking
          </button>
        </form>
        {checked && (
          <p className="model-feedback" role="status">
            {correct
              ? "That fits the relationship. "
              : "Try the relationship again. "}
            {unknown === "Part"
              ? "Multiply the whole by the percent divided by 100."
              : unknown === "Percent"
                ? "Divide the part by the whole, then multiply by 100."
                : "Divide the part by the percent written as a decimal."}
          </p>
        )}
      </details>
    </section>
  );
}

function RatioStudio() {
  const [per, setPer] = useState(3);
  const [groups, setGroups] = useState(4);
  useModelContext(
    "Ratio recipe: " +
      per +
      " cups water per 1 cup concentrate, " +
      groups +
      " batches. Discuss equivalent ratios and unit rates.",
  );
  return (
    <section className="model-card">
      <div className="model-heading">
        <span className="eyebrow">RATIO REMIX</span>
        <h3>Different amounts. The same recipe.</h3>
        <p>
          A pretend drink uses {per} cups of water for every 1 cup of
          concentrate.
        </p>
      </div>
      <div
        className="ratio-model"
        aria-label={`${groups} cups concentrate and ${groups * per} cups water`}
      >
        {Array.from({ length: groups }, (_, i) => (
          <motion.div
            layout
            key={i}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="ratio-group"
          >
            <span className="ratio-concentrate">1</span>
            <span>:</span>
            <span className="ratio-water">{per}</span>
          </motion.div>
        ))}
      </div>
      <div className="model-controls">
        <Range
          label="Water per 1 cup of concentrate"
          min={1}
          max={6}
          value={per}
          onChange={setPer}
        />
        <Range
          label="Batches"
          min={1}
          max={8}
          value={groups}
          onChange={setGroups}
        />
      </div>
      <div className="ratio-table">
        <span>Concentrate</span>
        <strong>1</strong>
        <strong>{groups}</strong>
        <span>Water</span>
        <strong>{per}</strong>
        <strong>{groups * per}</strong>
      </div>
      <div className="model-insight">
        <strong>
          {groups * per} ÷ {groups} = {per} cups of water per 1 cup of
          concentrate.
        </strong>
        <p>
          Change the batches: both quantities scale together. Change water per
          cup: the recipe itself changes.
        </p>
      </div>
    </section>
  );
}

function FractionStudio() {
  const [a, setA] = useState(3),
    [b, setB] = useState(4),
    [c, setC] = useState(1),
    [d, setD] = useState(2);
  const [operation, setOperation] = useState("Divide");
  const numerator = operation === "Divide" ? a * d : a * c,
    denominator = operation === "Divide" ? b * c : b * d;
  const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);
  const factor = gcd(numerator, denominator);
  useModelContext(
    "Fraction model: " +
      a +
      "/" +
      b +
      " " +
      operation +
      " " +
      c +
      "/" +
      d +
      ". Discuss the meaning of the operation before the rule.",
  );
  return (
    <section className="model-card">
      <div className="model-heading">
        <span className="eyebrow">FRACTION STUDIO</span>
        <h3>Make the operation visible.</h3>
        <p>
          Both bars use the same-sized whole. Change the pieces and compare.
        </p>
      </div>
      <ChoiceGroup
        label="Operation"
        values={["Divide", "Multiply"]}
        selected={operation}
        onChange={setOperation}
      />
      <div className="fraction-compare">
        {[
          [a, b, "First fraction"],
          [c, d, "Second fraction"],
        ].map(([n, total, label]) => (
          <div key={String(label)}>
            <span>
              {label} · {n}/{total}
            </span>
            <div className="fraction-track">
              {Array.from({ length: Number(total) }, (_, i) => (
                <motion.span
                  key={i}
                  animate={{
                    backgroundColor: i < Number(n) ? "#718265" : "#e8eade",
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="model-controls">
        <Range
          label="First numerator"
          min={1}
          max={b}
          value={a}
          onChange={setA}
        />
        <Range
          label="First denominator"
          min={2}
          max={8}
          value={b}
          onChange={(v) => {
            setB(v);
            setA(Math.min(a, v));
          }}
        />
        <Range
          label="Second numerator"
          min={1}
          max={d}
          value={c}
          onChange={setC}
        />
        <Range
          label="Second denominator"
          min={2}
          max={8}
          value={d}
          onChange={(v) => {
            setD(v);
            setC(Math.min(c, v));
          }}
        />
      </div>
      <div className="model-insight">
        <strong>
          {a}/{b} {operation === "Divide" ? "÷" : "×"} {c}/{d} ={" "}
          {numerator / factor}/{denominator / factor}
        </strong>
        <p>
          {operation === "Divide"
            ? `How many groups of ${c}/${d} fit into ${a}/${b}? Use common-sized pieces: ${a * d}/${b * d} divided into groups of ${c * b}/${b * d}. That gives ${a * d}/${c * b} groups.`
            : `Find ${c}/${d} of ${a}/${b}. Split the whole into ${b * d} equal small pieces. The overlap covers ${a * c} of those pieces.`}
        </p>
      </div>
    </section>
  );
}

function ColorStudio() {
  const [source, setSource] = useState(7),
    [filter, setFilter] = useState(4),
    [surface, setSurface] = useState(4);
  const [prediction, setPrediction] = useState(""),
    [reveal, setReveal] = useState(false);
  const through = transmittedLight(source, filter),
    result = reflectedLight(source, filter, surface);
  const choose = (setter: (n: number) => void) => (name: string) => {
    setter(lightColors.find((c) => c.name === name)!.mask);
    setReveal(false);
  };
  const resultColor = lightAppearance(result);
  useModelContext(
    "Light model: source " +
      lightAppearance(source).name +
      ", filter " +
      lightAppearance(filter).name +
      ", object " +
      lightAppearance(surface).name +
      ". Prediction: " +
      prediction +
      (reveal
        ? ". Observed appearance: " + resultColor.name
        : ". Prediction has not been tested yet."),
  );
  return (
    <section className="model-card color-studio">
      <div className="model-heading">
        <span className="eyebrow">FOLLOW THE LIGHT</span>
        <h3>A color needs a way to reach your eye.</h3>
        <p>
          Predict the object’s appearance, then send light through the system.
        </p>
      </div>
      <div
        className="light-system"
        aria-label={`Source ${lightAppearance(source).name}, filter ${lightAppearance(filter).name}, surface ${lightAppearance(surface).name}`}
      >
        <div>
          <motion.span
            className="light-source"
            animate={{ backgroundColor: lightAppearance(source).color }}
          />
          <strong>Source</strong>
        </div>
        <motion.span
          className="light-beam"
          animate={{ backgroundColor: lightAppearance(source).color }}
        />
        <div>
          <motion.span
            className="light-filter"
            animate={{ backgroundColor: lightAppearance(filter).color }}
          />
          <strong>Filter</strong>
        </div>
        <motion.span
          className="light-beam"
          animate={{
            backgroundColor: lightAppearance(through).color,
            opacity: through ? 1 : 0.2,
          }}
        />
        <div>
          <motion.span
            className="light-object"
            animate={{
              backgroundColor: reveal ? resultColor.color : "#e6e9df",
            }}
          >
            {!reveal && "?"}
          </motion.span>
          <strong>Object</strong>
        </div>
      </div>
      <ChoiceGroup
        label="Light source"
        values={lightColors.map((c) => c.name)}
        selected={lightAppearance(source).name}
        onChange={choose(setSource)}
      />
      <ChoiceGroup
        label="Ideal filter · white passes all colors"
        values={lightColors.map((c) => c.name)}
        selected={lightAppearance(filter).name}
        onChange={choose(setFilter)}
      />
      <ChoiceGroup
        label="Object under white light"
        values={lightColors.map((c) => c.name)}
        selected={lightAppearance(surface).name}
        onChange={choose(setSurface)}
      />
      <ChoiceGroup
        label="I predict the object will look…"
        values={[...lightColors.map((c) => c.name), "Dark"]}
        selected={prediction}
        onChange={(value) => {
          setPrediction(value);
          setReveal(false);
        }}
      />
      <button
        className="button dark"
        onClick={() => setReveal(true)}
        disabled={!prediction}
      >
        Send the light <span aria-hidden="true">↗</span>
      </button>
      {reveal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="model-insight"
          role="status"
        >
          <strong>
            {prediction === resultColor.name
              ? "Your prediction fits. "
              : "Something to investigate: "}
            The object appears {resultColor.name.toLowerCase()}.
          </strong>
          <p>
            {through
              ? `${lightAppearance(through).name} light passes through the filter. `
              : "The source and filter share no color channels, so no light passes through. "}
            {result
              ? `The surface reflects ${resultColor.name.toLowerCase()} light toward your eye.`
              : "No available color channel is reflected toward your eye."}
          </p>
        </motion.div>
      )}
      <p className="learning-fineprint">
        A simplified three-channel model with ideal filters and surfaces. Real
        materials reflect and transmit ranges of wavelengths.
      </p>
    </section>
  );
}

function MaterialsStudio() {
  const [material, setMaterial] = useState("Clear glass"),
    [light, setLight] = useState("On");
  const clear = material === "Clear glass",
    frosted = material === "Frosted glass",
    mirror = material === "Mirror";
  const lit = light === "On";
  useModelContext(
    "Light and materials: " +
      material +
      ", source " +
      light +
      ". Explore reflection, transmission, scattering and absorption.",
  );
  return (
    <section className="model-card">
      <div className="model-heading">
        <span className="eyebrow">A LIGHT PATH YOU CAN CHANGE</span>
        <h3>Where does the light go?</h3>
        <p>Swap the material. Follow what reaches the other side.</p>
      </div>
      <ChoiceGroup
        label="Material"
        values={["Clear glass", "Frosted glass", "Black card", "Mirror"]}
        selected={material}
        onChange={setMaterial}
      />
      <ChoiceGroup
        label="Light source"
        values={["On", "Off"]}
        selected={light}
        onChange={setLight}
      />
      <svg
        className="material-diagram"
        viewBox="0 0 500 250"
        role="img"
        aria-label={
          lit
            ? clear
              ? "Light passes through clear glass in mostly straight paths."
              : frosted
                ? "Light passes through frosted glass and scatters."
                : mirror
                  ? "Light reflects back from a mirror."
                  : "Black card absorbs most incoming light; none passes through."
            : "Light source off: no light reaches the material."
        }
      >
        <rect
          x="235"
          y="35"
          width="30"
          height="180"
          rx="5"
          fill={
            clear
              ? "#d1e4e150"
              : frosted
                ? "#d1e4e1"
                : mirror
                  ? "#bfcbd3"
                  : "#3d4637"
          }
          stroke="#829373"
        />
        <circle cx="55" cy="125" r="19" fill={lit ? "#d7df9c" : "#c9cebe"} />
        {[85, 125, 165].map((y, i) => (
          <g key={y}>
            <motion.path
              d={`M80 ${y} H235`}
              stroke="#9eae55"
              strokeWidth="3"
              animate={{ opacity: lit ? 1 : 0.1 }}
            />
            {(clear || frosted) && (
              <motion.path
                d={`M265 ${y} L440 ${frosted ? 40 + i * 85 : y}`}
                stroke="#9eae55"
                strokeWidth="3"
                animate={{ opacity: lit ? 0.7 : 0.1 }}
              />
            )}
            {mirror && (
              <motion.path
                d={`M235 ${y} L100 ${y}`}
                stroke="#9b91b8"
                strokeWidth="2"
                animate={{ opacity: lit ? 1 : 0.1 }}
              />
            )}
          </g>
        ))}
        <text x="50" y="225">
          source
        </text>
        <text x="225" y="242">
          material
        </text>
        <text x="390" y="225">
          other side
        </text>
      </svg>
      <div className="model-insight">
        <strong>
          {!lit
            ? "Seeing needs light."
            : clear
              ? "Transparent: most light passes through without much scattering."
              : frosted
                ? "Translucent: light passes through, but scatters."
                : mirror
                  ? "Reflection: light changes direction at the surface."
                  : "Opaque: light does not pass through."}
        </strong>
        <p>
          {!lit
            ? "An object does not send reflected light toward your eyes when there is no light to reflect."
            : clear
              ? "You can see a clear image through the material because the paths stay mostly organized."
              : frosted
                ? "The scattered paths make the image unclear even though the other side is lit."
                : mirror
                  ? "The mirror sends light back. Try the reflection experiment in Discovery Lab to investigate the angles."
                  : "Black card absorbs most of the light. Some light can reflect from its surface. Opaque describes transmission, not whether an object reflects or absorbs."}
        </p>
      </div>
      <p className="learning-fineprint">
        Illustrative ray paths. Real materials can reflect, transmit, and absorb
        different portions of the same light.
      </p>
    </section>
  );
}

const frenchPrompts = [
  {
    meaning: "I have a book.",
    words: ["J’", "ai", "un", "livre."],
    hint: "Possession uses avoir. Je becomes j’ before a vowel sound.",
  },
  {
    meaning: "I do not have a book.",
    words: ["Je", "n’", "ai", "pas", "de", "livre."],
    hint: "With negative possession, un becomes de. Ne becomes n’ before ai.",
  },
  {
    meaning: "We are ready.",
    words: ["Nous", "sommes", "prêts."],
    hint: "A state or description uses être. With nous, choose sommes.",
  },
  {
    meaning: "They have two pencils.",
    words: ["Ils", "ont", "deux", "crayons."],
    hint: "Having something uses avoir. With ils, choose ont.",
  },
];
const erPrompts = [
  {
    meaning: "We speak French.",
    words: ["Nous", "parlons", "français."],
    hint: "With nous, regular -ER verbs take the ending -ons.",
  },
  {
    meaning: "I do not like football.",
    words: ["Je", "n’", "aime", "pas", "le", "football."],
    hint: "Ne…pas surrounds the verb. Ne becomes n’ before aime.",
  },
  {
    meaning: "They play football.",
    words: ["Ils", "jouent", "au", "football."],
    hint: "With ils, regular -ER verbs take the ending -ent.",
  },
];
function FrenchStudio({ lesson }: { lesson: LessonView }) {
  const prompts = /-er|elision/i.test(lesson.lesson_title)
    ? erPrompts
    : frenchPrompts;
  const [index, setIndex] = useState(0),
    [selected, setSelected] = useState<number[]>([]),
    [checked, setChecked] = useState(false),
    [hint, setHint] = useState(false);
  const prompt = prompts[index];
  const sentence = selected
    .map((id) => prompt.words[id])
    .join(" ")
    .replace(/([’'])\s+/g, "$1");
  useModelContext(
    "French sentence builder. Target meaning: " +
      prompt.meaning +
      ". Current attempt: " +
      sentence +
      ". Guide the grammar without replacing the learner’s thinking.",
  );
  const bank = prompt.words
    .map((word, id) => ({ word, id }))
    .sort((a, b) => a.word.localeCompare(b.word));
  const correct =
    selected.length === prompt.words.length &&
    selected.every((id, i) => id === i);
  return (
    <section className="model-card">
      <div className="model-heading">
        <span className="eyebrow">THE SENTENCE GARDEN</span>
        <h3>Meaning first. Then the words.</h3>
        <p>
          Build a fresh example by tapping words in order. Tap a placed word to
          return it.
        </p>
      </div>
      <p className="translation-prompt">“{prompt.meaning}”</p>
      <div className="sentence-tray" aria-label="Your sentence">
        {selected.length ? (
          selected.map((id, i) => (
            <motion.button
              layout
              key={id}
              onClick={() => {
                setSelected(selected.filter((_, n) => n !== i));
                setChecked(false);
              }}
              aria-label={`Remove ${prompt.words[id]}`}
              lang="fr"
            >
              {prompt.words[id]}
            </motion.button>
          ))
        ) : (
          <span>Your sentence grows here…</span>
        )}
      </div>
      {selected.length > 0 && (
        <p
          className="assembled-sentence"
          lang="fr"
          aria-label="Joined sentence"
        >
          {sentence}
        </p>
      )}
      <div className="word-bank" aria-label="Available words">
        {bank.map(({ word, id }) => (
          <motion.button
            layout
            key={id}
            disabled={selected.includes(id)}
            onClick={() => {
              setSelected([...selected, id]);
              setChecked(false);
            }}
            lang="fr"
          >
            {word}
          </motion.button>
        ))}
      </div>
      <div className="learning-actions">
        <button
          className="button dark"
          disabled={selected.length !== prompt.words.length}
          onClick={() => setChecked(true)}
        >
          Check the sentence
        </button>
        <button
          className="text-button"
          onClick={() => setHint(!hint)}
          aria-expanded={hint}
        >
          A little hint
        </button>
        <button
          className="text-button"
          onClick={() => {
            setSelected([]);
            setChecked(false);
          }}
        >
          Start over
        </button>
      </div>
      {hint && <p className="model-insight">{prompt.hint}</p>}
      {checked && (
        <p className="model-feedback" role="status">
          {correct
            ? "That’s it. Now explain why the verb fits the meaning."
            : "Read the meaning again. Find the subject, then place the verb and any negative words around it."}
        </p>
      )}
      <button
        className="text-button"
        onClick={() => {
          setIndex((index + 1) % prompts.length);
          setSelected([]);
          setChecked(false);
          setHint(false);
        }}
      >
        Try another meaning →
      </button>
    </section>
  );
}

const testSet = [
  { name: "Fern", truth: true },
  { name: "Pebble", truth: false },
  { name: "Moss", truth: true },
  { name: "Glass", truth: false },
  { name: "Oak", truth: true },
  { name: "Brick", truth: false },
];
function EvaluationStudio() {
  const [predictions, setPredictions] = useState([
    true,
    true,
    false,
    false,
    true,
    false,
  ]);
  const [confidence, setConfidence] = useState(80),
    [revealed, setRevealed] = useState(false);
  useModelContext(
    "Fair-testing model: predictions " +
      JSON.stringify(predictions) +
      ", confidence " +
      confidence +
      "%. Results " +
      (revealed ? "revealed" : "not yet revealed") +
      ". Separate accuracy from confidence.",
  );
  const score = accuracy(
    predictions,
    testSet.map((item) => item.truth),
  );
  return (
    <section className="model-card">
      <div className="model-heading">
        <span className="eyebrow">THE FAIR TEST</span>
        <h3>Confident doesn’t always mean correct.</h3>
        <p>
          A pretend classifier predicts whether something is a plant. Tap its
          predictions to edit them before opening the test results.
        </p>
      </div>
      <div className="test-set">
        {testSet.map((item, i) => (
          <motion.button
            layout
            className={
              revealed
                ? predictions[i] === item.truth
                  ? "test-correct"
                  : "test-missed"
                : ""
            }
            key={item.name}
            onClick={() => {
              setPredictions(predictions.map((p, n) => (n === i ? !p : p)));
              setRevealed(false);
            }}
            aria-label={`${item.name}: predicted ${predictions[i] ? "plant" : "not a plant"}. Tap to change.`}
          >
            <span>{item.name}</span>
            <strong>{predictions[i] ? "Plant" : "Not a plant"}</strong>
            <small>
              {revealed
                ? `Actual: ${item.truth ? "plant" : "not a plant"}`
                : "Tap to change prediction"}
            </small>
          </motion.button>
        ))}
      </div>
      <Range
        label="The classifier’s confidence"
        min={0}
        max={100}
        step={5}
        suffix="%"
        value={confidence}
        onChange={setConfidence}
      />
      <button className="button dark" onClick={() => setRevealed(true)}>
        Open the test results
      </button>
      {revealed && (
        <div className="model-insight" role="status">
          <strong>
            {Math.round(score * 10) / 10}% accuracy ·{" "}
            {Math.round((score * testSet.length) / 100)} of {testSet.length}{" "}
            correct.
          </strong>
          <p>
            Confidence is {confidence}%. Changing confidence doesn’t change a
            single correct answer. Accuracy compares predictions with known
            truth.
          </p>
          <p>
            These six items are an illustrative test set, not training examples.
            After tuning predictions on these results, you would need a new
            unseen test set for a fair evaluation.
          </p>
        </div>
      )}
    </section>
  );
}

function AlgorithmStudio() {
  const [rain, setRain] = useState("Yes"),
    [step, setStep] = useState(0);
  useModelContext(
    "Program trace: raining " +
      rain +
      ", current step " +
      (step + 1) +
      ". Explain input, a conditional branch, and output.",
  );
  const steps = [
    "Read the weather input",
    "Ask: is it raining?",
    rain === "Yes" ? "Choose an umbrella" : "Choose sunglasses",
    "Display the recommendation",
  ];
  return (
    <section className="model-card">
      <div className="model-heading">
        <span className="eyebrow">FOLLOW THE PROGRAM</span>
        <h3>A decision, one step at a time.</h3>
        <p>
          Change the input, then step through the rule. Predict which branch
          runs.
        </p>
      </div>
      <ChoiceGroup
        label="Is it raining?"
        values={["Yes", "No"]}
        selected={rain}
        onChange={(v) => {
          setRain(v);
          setStep(0);
        }}
      />
      <ol className="algorithm-flow">
        {steps.map((text, i) => (
          <motion.li
            key={i}
            animate={{
              opacity: i <= step ? 1 : 0.38,
              scale: i === step ? 1.02 : 1,
            }}
            aria-current={i === step ? "step" : undefined}
          >
            <span>{i + 1}</span>
            {text}
            {i === step && <small>YOU ARE HERE</small>}
          </motion.li>
        ))}
      </ol>
      <div className="learning-actions">
        <button
          className="button dark"
          disabled={step === 3}
          onClick={() => setStep(step + 1)}
        >
          Run next step →
        </button>
        <button className="text-button" onClick={() => setStep(0)}>
          Restart
        </button>
      </div>
      {step === 3 && (
        <p className="model-insight">
          Same instructions, different input, different output. This program
          follows an explicit rule; it hasn’t learned the rule from training
          data.
        </p>
      )}
    </section>
  );
}

function EvidenceStudio({
  lesson,
  journal,
}: {
  lesson: LessonView;
  journal: Journal;
}) {
  const [stage, setStage] = useState(0);
  const fields = [
    {
      key: "claim",
      title: "What do you think?",
      label: "Your claim",
      prompt: "One precise idea you can support.",
    },
    {
      key: "evidence",
      title: "What makes you say that?",
      label: "Evidence from the text",
      prompt: "An exact quote or detail, plus where it appears.",
    },
    {
      key: "reasoning",
      title: "Build the bridge.",
      label: "How the evidence supports your claim",
      prompt: "This detail matters because…",
    },
  ];
  const field = fields[stage];
  useModelContext(
    "Evidence bridge. Current step: " +
      field.label +
      ". Ask the learner to connect a specific claim, accurate textual evidence, and reasoning.",
  );
  return (
    <section className="model-card">
      <div className="model-heading">
        <span className="eyebrow">THE EVIDENCE BRIDGE</span>
        <h3>Help someone follow your thinking.</h3>
        <p>
          Work with the reading named in your lesson. Keep the text close by.
        </p>
      </div>
      <div className="evidence-steps">
        {fields.map((f, i) => (
          <button
            key={f.key}
            aria-pressed={stage === i}
            onClick={() => setStage(i)}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {f.key}
            <i>{journal.entries[f.key]?.trim() ? "•" : "○"}</i>
          </button>
        ))}
      </div>
      <Scene id={field.key}>
        <h4 className="thinking-question">{field.title}</h4>
        <JournalPrompt
          label={field.label}
          placeholder={field.prompt}
          value={journal.entries[field.key] ?? ""}
          onChange={(v) => journal.write(field.key, v)}
        />
      </Scene>
      <div className="learning-actions">
        <button
          className="text-button"
          disabled={stage === 0}
          onClick={() => setStage(stage - 1)}
        >
          ← Previous
        </button>
        <button
          className="button dark"
          disabled={stage === 2}
          onClick={() => setStage(stage + 1)}
        >
          Next connection →
        </button>
      </div>
      <details className="source-peek">
        <summary>Look back at the lesson</summary>
        <p>{lesson.written_instruction}</p>
        {lesson.source_references.map((source, i) => (
          <small key={i}>{source}</small>
        ))}
      </details>
      <details className="model-challenge">
        <summary>Read your whole argument</summary>
        <div className="argument-preview">
          {fields.map((f) => (
            <p key={f.key}>
              <span>{f.label}</span>
              {journal.entries[f.key] || "Your thinking will appear here."}
            </p>
          ))}
        </div>
        <p>
          Check: Is the claim specific? Is the evidence accurate? Does the
          reasoning explain the connection? A filled box alone doesn’t prove the
          argument is strong.
        </p>
      </details>
    </section>
  );
}

function ConnectionStudio({
  lesson,
  journal,
}: {
  lesson: LessonView;
  journal: Journal;
}) {
  const [selected, setSelected] = useState(0);
  useModelContext(
    "Connection map. Selected objective: " +
      (lesson.learning_objectives[selected] || lesson.lesson_title),
  );
  const concepts = lesson.learning_objectives.length
    ? lesson.learning_objectives
    : [lesson.lesson_title];
  return (
    <section className="model-card">
      <div className="model-heading">
        <span className="eyebrow">THE CONNECTION MAP</span>
        <h3>How do the ideas fit together?</h3>
        <p>
          Choose an idea from this lesson. Use its evidence to build a
          connection.
        </p>
      </div>
      <div className="concept-nodes">
        {concepts.map((objective, i) => (
          <motion.button
            layout
            key={i}
            aria-pressed={selected === i}
            onClick={() => setSelected(i)}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {objective}
          </motion.button>
        ))}
      </div>
      <Scene id={String(selected)}>
        <div className="connection-thread">
          <JournalPrompt
            label="An important fact or observation"
            value={journal.entries[`fact-${selected}`] ?? ""}
            onChange={(v) => journal.write(`fact-${selected}`, v)}
          />
          <span aria-hidden="true">↓</span>
          <JournalPrompt
            label="What does it help explain? How?"
            value={journal.entries[`connection-${selected}`] ?? ""}
            onChange={(v) => journal.write(`connection-${selected}`, v)}
          />
        </div>
      </Scene>
      <details className="source-peek">
        <summary>Open the lesson’s explanation</summary>
        <p>{lesson.written_instruction}</p>
      </details>
      <p className="model-insight">
        Try reversing the connection. Would the second idea still make sense
        without the first? Use evidence from the lesson to explain your answer.
      </p>
    </section>
  );
}
