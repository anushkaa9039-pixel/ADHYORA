// Class and subject choices. Entries in BUILT_IN have an author-written bank; every other choice gets an AI-written syllabus, diagnostic and practice.
export type Choice = { level: string; levelLabel: string; subject: string; engine: string | null };
const LOW = ['English', 'Mathematics', 'Environmental Studies', 'Hindi', 'Sanskrit', 'General Knowledge', 'Computer Science'];
const MID = ['English', 'Mathematics', 'Science', 'Social Science', 'History', 'Geography', 'Civics', 'Hindi', 'Sanskrit', 'Computer Science'];
const SEC = ['English', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Social Science', 'History', 'Geography', 'Political Science', 'Economics', 'Hindi', 'Sanskrit', 'Computer Science', 'Information Technology'];
const SR = ['English', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Economics', 'Accountancy', 'Business Studies', 'History', 'Geography', 'Political Science', 'Sociology', 'Psychology', 'Statistics', 'Applied Mathematics', 'Hindi', 'Physical Education'];
const UG = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Statistics', 'Electronics', 'Electrical Engineering', 'Mechanical Engineering', 'Civil Engineering', 'Economics', 'Commerce', 'Accountancy', 'Business Management', 'Law', 'English Literature', 'History', 'Political Science', 'Sociology', 'Psychology', 'Philosophy', 'Environmental Science'];
const PG = ['Advanced Mathematics', 'Advanced Physics', 'Organic Chemistry', 'Data Science', 'Machine Learning', 'Macroeconomics', 'Linguistics', 'Business Administration', 'Research Methodology', 'Public Administration', 'Finance', 'Applied Statistics', 'English Literature (MA)', 'Software Engineering'];
export const LEVELS: { id: string; label: string; subjects: string[] }[] = [
  ...Array.from({ length: 12 }, (_, i) => ({ id: 'c' + (i + 1), label: 'Class ' + (i + 1), subjects: i < 5 ? LOW : i < 8 ? MID : i < 10 ? SEC : SR })),
  { id: 'ug', label: 'College: UG (Bachelor\u2019s)', subjects: UG },
  { id: 'pg', label: 'College: PG (Master\u2019s)', subjects: PG },
];
const BUILT_IN: Record<string, string> = { 'c10|physics': 'physics', 'c10|mathematics': 'maths' };
export const engineFor = (level: string, subject: string): string | null => BUILT_IN[`${level}|${subject.trim().toLowerCase()}`] ?? null;
