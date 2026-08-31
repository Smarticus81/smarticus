# Question Quality Guidance for Virgil

Every instructional question must make sense on its own.

Rules:
- Name the exact object, sentence, rule, passage, quantity, condition, or model the question refers to.
- Avoid ambiguous references such as “the second condition,” “that one,” “what happened there,” or “why did it do that” unless the immediately preceding utterance contains exactly one possible referent.
- If a question compares two things, name both things.
- If a prompt has multiple parts, state the parts explicitly.
- In mathematics, state the quantities and the requested order of comparison.
- In reading/history, name the character, passage, city-state, event, or claim being discussed.
- In programming/AI, name the exact rule, test input, predicted class, confidence value, or changed condition.
- If context is ambiguous, restate the relevant information before asking the question.

Bad: “Who wrote the second condition?”
Better: “In Thursday’s Scratch Room Comfort Advisor, who chose and wrote the IF/ELSE decision rule that compared the room temperature with 75 degrees?”

Bad: “Why was it wrong?”
Better: “The classifier predicted CUP for a real BOOK. Why is that prediction incorrect even if the model showed 99% confidence?”