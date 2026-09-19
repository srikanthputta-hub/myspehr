/**
 * Fabricated demo dataset for the patient portal.
 * 100% synthetic — no real PHI.
 */

import type { FhirPatient } from "./patient-store";
import { MRN_SYSTEM } from "./mrn";

export const TEST_MRN = "MRN-123456";

export const TEST_PATIENT: FhirPatient = {
  resourceType: "Patient",
  id: "123456",
  identifier: [{ system: MRN_SYSTEM, value: TEST_MRN }],
  name: [{ use: "official", family: "Doe", given: ["Alex", "T."], text: "Alex T. Doe" }],
  gender: "other",
  birthDate: "1989-04-12",
};

export const TEST_DEMOGRAPHICS = {
  address: "42 Linden Avenue, Apt 5B, Bengaluru, KA 560001",
  contactNumber: "+91 98765 43210",
  emergencyContact: {
    name: "Priya Doe",
    relationship: "Spouse",
    phone: "+91 98765 11223",
  },
};

export interface DemoMedication {
  id: string;
  name: string;
  dose: string;
  schedule: string;
  status: "active" | "on-hold" | "completed";
  prescribed: string;
  prescriber: string;
}

export const MEDICATIONS_ADMINISTERED: DemoMedication[] = [
  {
    id: "ma1",
    name: "Ceftriaxone IV",
    dose: "1 g",
    schedule: "Single dose · ER",
    status: "completed",
    prescribed: "2026-03-17",
    prescriber: "Dr. P. Khan",
  },
  {
    id: "ma2",
    name: "Paracetamol IV",
    dose: "1 g",
    schedule: "Single dose · ER",
    status: "completed",
    prescribed: "2026-03-17",
    prescriber: "Dr. P. Khan",
  },
];

export const MEDICATIONS_PRESCRIBED: DemoMedication[] = [
  {
    id: "mp1",
    name: "Amoxicillin",
    dose: "500 mg",
    schedule: "Three times daily x 7 days",
    status: "completed",
    prescribed: "2026-03-18",
    prescriber: "Dr. P. Khan",
  },
  {
    id: "mp2",
    name: "Salbutamol Inhaler",
    dose: "100 mcg",
    schedule: "2 puffs as needed",
    status: "completed",
    prescribed: "2026-03-18",
    prescriber: "Dr. P. Khan",
  },
];

export const ACTIVE_OUTPATIENT_MEDICATIONS: DemoMedication[] = [
  {
    id: "ao1",
    name: "Lisinopril",
    dose: "10 mg",
    schedule: "Once daily, morning",
    status: "active",
    prescribed: "2025-09-14",
    prescriber: "Dr. R. Menon",
  },
  {
    id: "ao2",
    name: "Atorvastatin",
    dose: "20 mg",
    schedule: "Once daily, bedtime",
    status: "active",
    prescribed: "2025-09-14",
    prescriber: "Dr. R. Menon",
  },
  {
    id: "ao3",
    name: "Metformin",
    dose: "500 mg",
    schedule: "Twice daily with food",
    status: "active",
    prescribed: "2026-01-03",
    prescriber: "Dr. S. Iyer",
  },
];

// Back-compat aggregate
export const DEMO_MEDICATIONS: DemoMedication[] = [
  ...ACTIVE_OUTPATIENT_MEDICATIONS,
  ...MEDICATIONS_PRESCRIBED,
  ...MEDICATIONS_ADMINISTERED,
];

export interface DemoCondition {
  id: string;
  label: string;
  onset: string;
  status: "active" | "resolved";
  severity?: "mild" | "moderate" | "severe";
}

export const DEMO_CONDITIONS: DemoCondition[] = [
  { id: "c1", label: "Type 2 Diabetes Mellitus", onset: "2024-08-02", status: "active", severity: "moderate" },
  { id: "c2", label: "Essential Hypertension", onset: "2023-05-21", status: "active", severity: "mild" },
  { id: "c3", label: "Seasonal Allergic Rhinitis", onset: "2019-04-10", status: "active", severity: "mild" },
  { id: "c4", label: "Acute Bronchitis", onset: "2026-03-18", status: "resolved" },
];

export interface DemoAllergy {
  id: string;
  substance: string;
  reaction: string;
  severity: "low" | "moderate" | "high";
}

export const DEMO_ALLERGIES: DemoAllergy[] = [
  { id: "a1", substance: "Penicillin", reaction: "Hives", severity: "moderate" },
  { id: "a2", substance: "Peanuts", reaction: "Anaphylaxis", severity: "high" },
];

export interface DemoAppointment {
  id: string;
  title: string;
  provider: string;
  location: string;
  startsAt: string;
  status: "booked" | "proposed" | "completed" | "cancelled";
}

export const DEMO_APPOINTMENTS: DemoAppointment[] = [
  {
    id: "ap1",
    title: "Endocrinology follow-up",
    provider: "Dr. S. Iyer",
    location: "Srik Health Clinic · Suite 204",
    startsAt: "2026-07-08T10:30:00",
    status: "booked",
  },
  {
    id: "ap2",
    title: "Annual physical",
    provider: "Dr. R. Menon",
    location: "Srik Health Clinic · Suite 101",
    startsAt: "2026-09-22T09:00:00",
    status: "booked",
  },
  {
    id: "ap3",
    title: "Dental cleaning",
    provider: "Dr. L. Park",
    location: "Smile Dental Group",
    startsAt: "2026-06-30T15:15:00",
    status: "proposed",
  },
  {
    id: "ap4",
    title: "Lab draw — HbA1c",
    provider: "Phlebotomy",
    location: "Srik Health Clinic · Lab",
    startsAt: "2026-05-12T08:00:00",
    status: "completed",
  },
];

export interface DemoObservation {
  id: string;
  kind: "Blood Pressure" | "Heart Rate" | "Body Temperature" | "Respiratory Rate" | "SpO₂";
  value: string;
  takenAt: string;
  flag?: "normal" | "elevated" | "low";
}

export const DEMO_OBSERVATIONS: DemoObservation[] = [
  { id: "o1", kind: "Blood Pressure", value: "128 / 82 mmHg", takenAt: "2026-06-22T07:40:00", flag: "elevated" },
  { id: "o2", kind: "Heart Rate", value: "72 bpm", takenAt: "2026-06-22T07:40:00", flag: "normal" },
  { id: "o3", kind: "Respiratory Rate", value: "16 / min", takenAt: "2026-06-22T07:40:00", flag: "normal" },
  { id: "o4", kind: "Body Temperature", value: "36.8 °C", takenAt: "2026-06-22T07:40:00", flag: "normal" },
  { id: "o5", kind: "SpO₂", value: "98 %", takenAt: "2026-06-22T07:40:00", flag: "normal" },
];

export interface DemoEncounter {
  id: string;
  reason: string;
  type: "Inpatient" | "Outpatient" | "Emergency";
  facility: string;
  admittedAt: string;
  dischargedAt?: string;
}

export const DEMO_ENCOUNTERS: DemoEncounter[] = [
  {
    id: "e1",
    reason: "Diabetes management — initial workup",
    type: "Outpatient",
    facility: "Srik Health Clinic",
    admittedAt: "2024-08-02T09:30:00",
    dischargedAt: "2024-08-02T11:00:00",
  },
  {
    id: "e2",
    reason: "Acute bronchitis",
    type: "Emergency",
    facility: "Srik General Hospital",
    admittedAt: "2026-03-17T22:10:00",
    dischargedAt: "2026-03-18T06:45:00",
  },
  {
    id: "e3",
    reason: "Annual wellness exam",
    type: "Outpatient",
    facility: "Srik Health Clinic",
    admittedAt: "2025-09-14T09:00:00",
    dischargedAt: "2025-09-14T09:45:00",
  },
];

export interface DemoMessage {
  id: string;
  from: string;
  role: string;
  subject: string;
  preview: string;
  sentAt: string;
  unread: boolean;
}

export const DEMO_MESSAGES: DemoMessage[] = [
  {
    id: "msg1",
    from: "Dr. S. Iyer",
    role: "Endocrinologist",
    subject: "HbA1c results are in",
    preview: "Your latest A1c is 6.9% — a solid improvement. Let's discuss the plan at your July visit.",
    sentAt: "2026-06-21T16:20:00",
    unread: true,
  },
  {
    id: "msg2",
    from: "Srik Health Clinic",
    role: "Front desk",
    subject: "Appointment reminder",
    preview: "Quick reminder about your endocrinology follow-up on July 8 at 10:30 AM.",
    sentAt: "2026-06-20T09:00:00",
    unread: true,
  },
  {
    id: "msg3",
    from: "Dr. R. Menon",
    role: "Primary care",
    subject: "Refill approved",
    preview: "I've approved a 90-day refill on your Lisinopril. The pharmacy has been notified.",
    sentAt: "2026-06-15T11:42:00",
    unread: false,
  },
];

export interface DemoInvoice {
  id: string;
  description: string;
  date: string;
  amount: number;
  status: "outstanding" | "paid" | "in-review";
}

export const DEMO_INVOICES: DemoInvoice[] = [
  { id: "in1", description: "ER visit — acute bronchitis", date: "2026-03-18", amount: 420.55, status: "outstanding" },
  { id: "in2", description: "Lab — HbA1c panel", date: "2026-05-12", amount: 64.0, status: "paid" },
  { id: "in3", description: "Office visit — annual physical", date: "2025-09-14", amount: 180.0, status: "paid" },
  { id: "in4", description: "Endocrinology consult", date: "2026-07-08", amount: 220.0, status: "in-review" },
];

export const DEMO_BALANCE = DEMO_INVOICES
  .filter((i) => i.status === "outstanding")
  .reduce((s, i) => s + i.amount, 0);

/* ---------------- Care Plan & Discharge Instructions ---------------- */

export const CARE_PLAN_DIET_ACTIVITY: string[] = [
  "Follow a low-sodium, diabetic-friendly diet (≤2 g sodium/day).",
  "Aim for 5 servings of vegetables and 2 servings of fruit per day.",
  "Drink at least 2 litres of water daily; limit caffeine to 2 cups.",
  "Walk briskly for 30 minutes, 5 days per week.",
  "Avoid strenuous lifting (>5 kg) for the first 2 weeks after discharge.",
  "Get 7–8 hours of sleep nightly; resume normal sleep schedule gradually.",
];

export const CARE_PLAN_FOLLOWUP: string[] = [
  "Endocrinology follow-up on 8 July 2026, 10:30 AM with Dr. S. Iyer.",
  "Repeat HbA1c and lipid panel one week before the next visit.",
  "Check blood pressure at home twice weekly; log readings.",
  "Call the clinic if fever >38.5 °C, chest pain, or shortness of breath.",
  "Refill prescriptions at least 5 days before they run out.",
  "Annual physical scheduled for 22 September 2026 with Dr. R. Menon.",
];
