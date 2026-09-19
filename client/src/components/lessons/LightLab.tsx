import { useState } from "react";
import { Icon } from "../Icon";

/**
 * The reflection playground.
 *
 * It used to live in the Discovery Lab, a standalone page of two demos wired to
 * no lesson and no record. The page is gone; this is the half of it that was
 * doing real work, because a lesson about mirrors or angles of reflection
 * renders it as that lesson's Explore activity.
 */
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
