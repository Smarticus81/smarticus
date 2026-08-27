export interface LessonView {
  id: string;
  external_id?: string;
  date: string;
  school_year: string;
  grade_level: number;
  subject: string;
  course: string;
  unit_id: string;
  unit_title: string;
  lesson_number: number;
  lesson_title: string;
  standards: string[];
  previous_learning: string;
  course_context: string;
  learning_objectives: string[];
  why_it_matters: string;
  vocabulary: Array<{ term: string; definition: string }>;
  written_instruction: string;
  worked_examples: unknown[];
  guided_practice: unknown[];
  independent_practice: unknown[];
  exit_ticket: unknown[];
  mastery_threshold: number;
  materials: string[];
  estimated_minutes: number;
  voice_prompt: string;
  teacher_notes: string;
  answer_key: Record<string, string>;
  source_references: string[];
  status: string;
  day_number?: number;
  todays_goal?: string;
}

export interface ScheduleView {
  date: string;
  school_year: string;
  grade_level: number;
  day_number: number;
  todays_goal: string;
  lessons: LessonView[];
}
