import type { IconName } from "../components/Icon";
export const subjects: Record<
  string,
  { label: string; icon: IconName; color: string; description: string }
> = {
  mathematics: {
    label: "Mathematics",
    icon: "math",
    color: "lavender",
    description: "Find the patterns. Solve the puzzle.",
  },
  literature: {
    label: "Literature",
    icon: "book",
    color: "peach",
    description: "Great stories. Bigger ideas.",
  },
  writing: {
    label: "Writing",
    icon: "pen",
    color: "pink",
    description: "Turn your thoughts into something powerful.",
  },
  science: {
    label: "Science",
    icon: "flask",
    color: "lime",
    description: "Stay curious. Put your ideas to the test.",
  },
  history_geography: {
    label: "History & geography",
    icon: "globe",
    color: "sand",
    description: "Discover the people and places that shape us.",
  },
  french: {
    label: "French",
    icon: "globe",
    color: "blue",
    description: "A new way to see the world. On y va !",
  },
  computer_science: {
    label: "Computer science",
    icon: "code",
    color: "lavender",
    description: "Think it through. Build what’s next.",
  },
  pe: {
    label: "Movement & wellness",
    icon: "run",
    color: "lime",
    description: "Move your body. Recharge your mind.",
  },
  art_design: {
    label: "Art & design",
    icon: "art",
    color: "peach",
    description: "Make something only you could imagine.",
  },
};
export function subjectInfo(subject: string) {
  return (
    subjects[subject] ?? {
      label: subject.replaceAll("_", " "),
      icon: "book" as const,
      color: "blue",
      description: "Follow your curiosity.",
    }
  );
}
export function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function friendlyDate(date: string, short = false) {
  return new Intl.DateTimeFormat("en-US", {
    month: short ? "short" : "long",
    day: "numeric",
    ...(short ? {} : { weekday: "long" }),
  }).format(new Date(`${date}T12:00:00`));
}
