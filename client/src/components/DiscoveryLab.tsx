import { useState } from "react";
import { Icon } from "./Icon";

export function DiscoveryLab() {
  const [lab, setLab] = useState<"light" | "fractions">("light");
  return (
    <>
      <div className="lab-selector">
        <button
          className={lab === "light" ? "selected" : ""}
          aria-pressed={lab === "light"}
          onClick={() => setLab("light")}
        >
          <span className="subject-icon lime">
            <Icon name="sun" />
          </span>
          <span>
            <strong>Light playground</strong>
            <small>Reflection · Science</small>
          </span>
          <Icon name="arrow" />
        </button>
        <button
          className={lab === "fractions" ? "selected" : ""}
          aria-pressed={lab === "fractions"}
          onClick={() => setLab("fractions")}
        >
          <span className="subject-icon lavender">
            <Icon name="math" />
          </span>
          <span>
            <strong>Fraction remixer</strong>
            <small>Parts of a whole · Mathematics</small>
          </span>
          <Icon name="arrow" />
        </button>
      </div>
      {lab === "light" ? <LightLab /> : <FractionLab />}
      <div className="lab-bottom-note">
        <Icon name="compass" />
        <p>
          <strong>Be a scientist about it.</strong> Make a prediction. Change
          one thing. Explain what you notice.
        </p>
      </div>
    </>
  );
}
export function LightLab() {
  const [angle, setAngle] = useState(40);
  const [revealed, setRevealed] = useState(false);
  const radians = (angle * Math.PI) / 180;
  const dx = Math.sin(radians) * 225;
  const dy = Math.cos(radians) * 225;
  return (
    <section className="experiment">
      <div className="experiment-stage light-stage">
        <div className="experiment-label">
          <span className="tiny-dot" />
          LIVE EXPERIMENT <span>01 / LIGHT</span>
        </div>
        <h2>Every bounce has a pattern.</h2>
        <p>Move the beam. Watch the reflection.</p>
        <svg
          viewBox="0 0 640 360"
          className="light-diagram"
          role="img"
          aria-label={`A light ray hits a horizontal mirror at ${angle} degrees from the normal and reflects at ${angle} degrees on the other side.`}
        >
          <defs>
            <marker
              id="ray-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M0 0 10 5 0 10Z" fill="#d1ef88" />
            </marker>
            <marker
              id="reflected-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M0 0 10 5 0 10Z" fill="#c7b8f7" />
            </marker>
          </defs>
          <line
            x1="320"
            y1="20"
            x2="320"
            y2="286"
            stroke="#8c9c94"
            strokeDasharray="6 7"
          />
          <text x="333" y="33" fill="#b4c4b9" fontSize="13">
            normal
          </text>
          <path d="M70 286h500" stroke="#d7e7dc" strokeWidth="5" />
          <path
            d="M70 294h500"
            stroke="#69786c"
            strokeWidth="9"
            strokeDasharray="2 8"
          />
          <text x="285" y="325" fill="#b4c4b9" fontSize="14">
            MIRROR
          </text>
          <line
            x1={320 - dx}
            y1={286 - dy}
            x2="320"
            y2="286"
            stroke="#d1ef88"
            strokeWidth="4"
            markerEnd="url(#ray-arrow)"
          />
          <line
            x1="320"
            y1="286"
            x2={320 + dx}
            y2={286 - dy}
            stroke="#c7b8f7"
            strokeWidth="4"
            markerEnd="url(#reflected-arrow)"
          />
          <circle cx="320" cy="286" r="7" fill="#f2f8e7" />
          <text x="195" y="250" fill="#d1ef88" fontSize="20">
            {angle}° in
          </text>
          <text x="370" y="250" fill="#c7b8f7" fontSize="20">
            {angle}° out
          </text>
        </svg>
        <div className="diagram-legend">
          <span>
            <i className="lime" />
            Incoming light
          </span>
          <span>
            <i className="lavender" />
            Reflected light
          </span>
        </div>
      </div>
      <div className="experiment-controls">
        <span className="eyebrow">YOU’RE IN CONTROL</span>
        <h3>Find the rule.</h3>
        <p>
          What happens to the outgoing beam when you change the incoming angle?
        </p>
        <label className="range-label" htmlFor="light-angle">
          Incoming angle <output>{angle}°</output>
        </label>
        <input
          id="light-angle"
          type="range"
          min="10"
          max="75"
          value={angle}
          onChange={(event) => setAngle(Number(event.target.value))}
        />
        <div className="range-extents">
          <span>10°</span>
          <span>75°</span>
        </div>
        <div className="experiment-challenge">
          <span className="eyebrow">TRY THIS</span>
          <h4>Make a right-angle turn.</h4>
          <p>
            Can you set the angle so the two rays form a 90° corner at the
            mirror?
          </p>
          <p className="discovery-feedback" role="status">
            {angle === 45
              ? "You found it! 45° + 45° = 90°."
              : `The angle between the rays is ${angle * 2}°.`}
          </p>
        </div>
        <button
          className="button outline"
          onClick={() => setRevealed(!revealed)}
          aria-expanded={revealed}
        >
          {revealed ? "Hide the explanation" : "Why does that happen?"}
          <Icon name="star" size={17} />
        </button>
        {revealed && (
          <p className="lab-explanation">
            On a flat mirror, the angle of incidence equals the angle of
            reflection. Both are measured from the normal: the imaginary line
            perpendicular to the mirror. This is the law of reflection.
          </p>
        )}
        <button
          className="text-button"
          onClick={() => {
            setAngle(40);
            setRevealed(false);
          }}
        >
          Reset experiment
        </button>
      </div>
    </section>
  );
}
function FractionLab() {
  const [parts, setParts] = useState(6);
  const [filled, setFilled] = useState(3);
  const [revealed, setRevealed] = useState(false);
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const factor = gcd(filled, parts);
  return (
    <section className="experiment">
      <div className="experiment-stage fraction-stage">
        <div className="experiment-label">
          <span className="tiny-dot" />
          LIVE EXPERIMENT <span>02 / FRACTIONS</span>
        </div>
        <h2>Same whole. New possibilities.</h2>
        <p>Tap a piece to change how much is filled.</p>
        <div className="fraction-value">
          <strong>
            {filled}
            <span />
            {parts}
          </strong>
          <span>=</span>
          <strong>
            {Math.round((filled / parts) * 1000) / 10}
            <small>%</small>
          </strong>
        </div>
        <div
          className="fraction-pieces"
          style={{ gridTemplateColumns: `repeat(${parts}, 1fr)` }}
        >
          {Array.from({ length: parts }, (_, index) => (
            <button
              key={index}
              className={index < filled ? "filled" : ""}
              aria-label={`Fill ${index + 1} of ${parts} parts`}
              aria-pressed={index < filled}
              onClick={() => setFilled(index + 1)}
            >
              <span>{index + 1}</span>
            </button>
          ))}
        </div>
        <div className="fraction-scale">
          <span>0 · nothing filled</span>
          <span>1 · one whole</span>
        </div>
        <span className="fraction-caption">
          Different pieces. The same-sized whole.
        </span>
      </div>
      <div className="experiment-controls">
        <span className="eyebrow">YOU’RE IN CONTROL</span>
        <h3>Remix the whole.</h3>
        <p>Divide the bar into equal pieces, then choose how many to fill.</p>
        <label className="range-label" htmlFor="fraction-parts">
          Equal pieces <output>{parts}</output>
        </label>
        <input
          id="fraction-parts"
          type="range"
          min="2"
          max="12"
          value={parts}
          onChange={(event) => {
            const value = Number(event.target.value);
            setParts(value);
            setFilled(Math.min(filled, value));
          }}
        />
        <label className="range-label" htmlFor="fraction-filled">
          Filled pieces <output>{filled}</output>
        </label>
        <input
          id="fraction-filled"
          type="range"
          min="0"
          max={parts}
          value={filled}
          onChange={(event) => setFilled(Number(event.target.value))}
        />
        <div className="experiment-challenge">
          <span className="eyebrow">TRY THIS</span>
          <h4>Find three ways to make half.</h4>
          <p>
            Try 4, 6, and 8 equal pieces. How many do you need to fill each
            time?
          </p>
          <p className="discovery-feedback" role="status">
            {filled * 2 === parts
              ? `Exactly half! ${filled}/${parts} = 1/2.`
              : `${filled}/${parts} is ${filled * 2 > parts ? "more" : "less"} than half.`}
          </p>
        </div>
        <button
          className="button outline"
          onClick={() => setRevealed(!revealed)}
          aria-expanded={revealed}
        >
          {revealed ? "Hide simplest form" : "Show simplest form"}
          <Icon name="star" size={17} />
        </button>
        {revealed && (
          <p className="lab-explanation">
            {filled}/{parts} = {filled / factor}/{parts / factor}.{" "}
            {factor > 1
              ? `Divide the top and bottom by ${factor}. The amount stays the same.`
              : "These numbers share no factor greater than 1, so this fraction is already in simplest form."}
          </p>
        )}
        <button
          className="text-button"
          onClick={() => {
            setParts(6);
            setFilled(3);
            setRevealed(false);
          }}
        >
          Reset experiment
        </button>
      </div>
    </section>
  );
}
