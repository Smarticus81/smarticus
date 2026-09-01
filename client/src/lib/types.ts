export interface WorkedExample {
  title: string;
  problem: string;
  solution: string;
  explanation: string;
}

export interface PracticeItem {
  id: string;
  prompt: string;
  hint?: string;
}

export interface ExitTicketItem {
  id: string;
  prompt: string;
  rubric?: string;
}

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
  worked_examples: WorkedExample[];
  guided_practice: PracticeItem[];
  independent_practice: PracticeItem[];
  exit_ticket: ExitTicketItem[];
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
  student?: {
    id: string;
    preferredName: string;
    gradeLevel: number;
  };
}

export interface AnswerSupport {
  itemId: string;
  supportType: string;
  hint: string;
  answerWithheld: boolean;
  answer?: string;
  reason?: string;
}
