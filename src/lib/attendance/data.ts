// ---------------------------------------------------------------------------
// AttendX — data model & seed data
// Mirrors the Supabase-ready schema from the project spec:
// STUDENTS, TEACHERS, CLASSES, SUBJECTS, ATTENDANCE_SESSIONS, QR_TOKENS,
// ATTENDANCE_RECORDS. Swapping these in-memory seeds for Supabase tables later
// only requires replacing the store actions.
// ---------------------------------------------------------------------------

export type Role = "student" | "teacher";
export type SessionStatus = "ACTIVE" | "UNDER_REVIEW" | "SUBMITTED";
export type TokenStatus = "ACTIVE" | "EXPIRED";
export type RecordStatus = "PRESENT" | "ABSENT";

export interface Student {
  id: string;
  student_id: string;
  name: string;
  class_id: string;
  semester: number;
}

export interface Teacher {
  id: string;
  teacher_id: string;
  name: string;
}

export interface ClassRoom {
  id: string;
  class_name: string;
  semester: number;
}

export interface Subject {
  id: string;
  subject_name: string;
  class_id: string;
}

export interface QrToken {
  id: string;
  session_id: string;
  token: string;
  created_at: number;
  expires_at: number;
  status: TokenStatus;
}

export interface AttendanceSession {
  id: string;
  session_id: string;
  teacher_id: string;
  class_id: string;
  subject_id: string;
  semester: number;
  date: string;
  start_time: number;
  end_time: number | null;
  teacher_latitude: number;
  teacher_longitude: number;
  attendance_radius: number;
  qr_validity: number;
  status: SessionStatus;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  subject_id: string;
  class_id: string;
  date: string;
  scan_time: number | null;
  status: RecordStatus;
  location_valid: boolean;
}

// --- Reference data --------------------------------------------------------

export const CLASSES: ClassRoom[] = [
  { id: "cls-bca-a", class_name: "BCA-A", semester: 3 },
  { id: "cls-bca-b", class_name: "BCA-B", semester: 3 },
  { id: "cls-bca-c", class_name: "BCA-C", semester: 3 },
];

export const SEMESTERS = [1, 2, 3, 4, 5, 6];

export const SUBJECTS: Subject[] = [
  { id: "sub-dbms", subject_name: "Database Management System", class_id: "cls-bca-a" },
  { id: "sub-ds", subject_name: "Data Structures", class_id: "cls-bca-a" },
  { id: "sub-web", subject_name: "Web Development", class_id: "cls-bca-a" },
  { id: "sub-os", subject_name: "Operating Systems", class_id: "cls-bca-a" },
];

export const TEACHERS: Teacher[] = [
  { id: "t-1", teacher_id: "TCH001", name: "Dr. Ananya Verma" },
];

export const QR_VALIDITY_OPTIONS = [10, 15, 20, 30];
export const RADIUS_OPTIONS = [50, 100, 200, 300];

const CLASS_PREFIX: Record<string, string> = {
  "cls-bca-a": "BCA",
  "cls-bca-b": "BCB",
  "cls-bca-c": "BCC",
};

const NAMES = [
  "Aarav Kumar", "Rohan Singh", "Ankit Raj", "Priya Kumari", "Sneha Sharma",
  "Vikash Yadav", "Ishita Verma", "Karan Mehta", "Divya Patel", "Aditya Gupta",
  "Neha Mishra", "Sahil Khan", "Riya Chatterjee", "Arjun Das", "Kavya Nair",
  "Manish Tiwari", "Pooja Singh", "Rahul Sharma", "Shreya Bose", "Nitin Kumar",
  "Ananya Iyer", "Deepak Chauhan", "Simran Kaur", "Varun Joshi", "Megha Reddy",
  "Harsh Vardhan", "Tanvi Desai", "Abhishek Pandey", "Ritika Saxena", "Suresh Raina",
  "Nidhi Agarwal", "Gaurav Bhatt", "Shalini Menon", "Yash Thakur", "Kriti Malhotra",
  "Amit Kumar", "Swati Kulkarni", "Rajat Kapoor", "Anjali Dubey", "Mohit Bansal",
  "Preeti Jha", "Siddharth Rao", "Garima Sinha", "Akash Chauhan", "Lakshmi Pillai",
  "Tushar Garg", "Rupal Shah", "Vivek Anand", "Shweta Tripathi", "Farhan Ahmed",
];

export function getRoster(classId: string): Student[] {
  const prefix = CLASS_PREFIX[classId] ?? "BCA";
  return NAMES.map((name, i) => ({
    id: `${classId}-${i + 1}`,
    student_id: `${prefix}${String(i + 1).padStart(3, "0")}`,
    name,
    class_id: classId,
    semester: 3,
  }));
}

export function findStudentByLoginId(loginId: string): Student | null {
  const id = loginId.trim().toUpperCase();
  for (const cls of CLASSES) {
    const hit = getRoster(cls.id).find((s) => s.student_id === id);
    if (hit) return hit;
  }
  return null;
}

export function className(classId: string): string {
  return CLASSES.find((c) => c.id === classId)?.class_name ?? classId;
}

export function subjectName(subjectId: string): string {
  return SUBJECTS.find((s) => s.id === subjectId)?.subject_name ?? subjectId;
}

// --- Deterministic PRNG (no Math.random at module scope) --------------------

function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dayAt(daysAgo: number, hour: number, minute: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export function fmtDate(d: Date | number): string {
  const date = typeof d === "number" ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

// --- Seed history -----------------------------------------------------------

const PAST_OFFSETS = [1, 2, 4, 5, 7, 9, 11, 12, 14, 16, 18, 20];
const SUBJECT_PRESENCE = [0.9, 0.85, 0.8, 0.88];

/** Per-student past attendance across all subjects (drives dashboard stats). */
export function makeStudentSeedRecords(student: Student): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];
  SUBJECTS.forEach((sub, si) => {
    const rand = mulberry32(hashSeed(student.student_id + sub.id));
    PAST_OFFSETS.forEach((off, di) => {
      const present = rand() < (SUBJECT_PRESENCE[si] ?? 0.85);
      const when = dayAt(off, 9, 55 + ((di * 3 + si) % 9));
      records.push({
        id: `seed-${student.student_id}-${sub.id}-${off}`,
        session_id: "SEED-HISTORY",
        student_id: student.student_id,
        subject_id: sub.id,
        class_id: student.class_id,
        date: fmtDate(when),
        scan_time: present ? when.getTime() : null,
        status: present ? "PRESENT" : "ABSENT",
        location_valid: present,
      });
    });
  });
  return records;
}

/** A few previously submitted full-class sessions for the teacher history. */
export function makeTeacherSeedSessions(teacherId: string): {
  sessions: AttendanceSession[];
  tokens: QrToken[];
  records: AttendanceRecord[];
} {
  const sessions: AttendanceSession[] = [];
  const tokens: QrToken[] = [];
  const records: AttendanceRecord[] = [];
  const roster = getRoster("cls-bca-a");
  const plan = [
    { off: 1, sub: "sub-dbms" },
    { off: 3, sub: "sub-web" },
    { off: 6, sub: "sub-ds" },
  ];
  plan.forEach((p, i) => {
    const start = dayAt(p.off, 10, 0);
    const end = dayAt(p.off, 10, 15);
    const sid = `SES-SEED-${i + 1}`;
    sessions.push({
      id: sid,
      session_id: sid,
      teacher_id: teacherId,
      class_id: "cls-bca-a",
      subject_id: p.sub,
      semester: 3,
      date: fmtDate(start),
      start_time: start.getTime(),
      end_time: end.getTime(),
      teacher_latitude: 22.5726,
      teacher_longitude: 88.3639,
      attendance_radius: 200,
      qr_validity: 15,
      status: "SUBMITTED",
    });
    tokens.push({
      id: `tok-${sid}`,
      session_id: sid,
      token: `ATT-${sid}-ARCHIVED`,
      created_at: start.getTime(),
      expires_at: start.getTime() + 15000,
      status: "EXPIRED",
    });
    const rand = mulberry32(hashSeed(sid));
    roster.forEach((stu, si) => {
      const present = rand() < 0.86;
      const scan = present ? start.getTime() + 20000 + si * 9000 : null;
      records.push({
        id: `${sid}-${stu.student_id}`,
        session_id: sid,
        student_id: stu.student_id,
        subject_id: p.sub,
        class_id: stu.class_id,
        date: fmtDate(start),
        scan_time: scan,
        status: present ? "PRESENT" : "ABSENT",
        location_valid: present,
      });
    });
  });
  return { sessions, tokens, records };
}
