import { useEffect, useState } from "react";

export function useLearningJournal(lessonId: string) {
  const key = `smarticus-journal:${lessonId}`;
  const [entries, setEntries] = useState<Record<string, string>>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? "{}");
      return Object.fromEntries(
        Object.entries(value ?? {}).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
    } catch {
      return {};
    }
  });
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(entries));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [entries, key]);
  const write = (name: string, value: string) =>
    setEntries((previous) => ({ ...previous, [name]: value }));
  return { entries, write, saved };
}
