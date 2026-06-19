import { Employee } from "../types/Employee";
import { Attendance } from "../types/Attendance";

export const employees: Employee[] = [
  {
  id: "1",
  employeeId: "EMP001",
  name: "Mubasshara",
  email: "mubasshara@gmail.com",
  department: "IT",
  role: "Software Engineer",
  imageUrl: "",
  descriptor: new Float32Array(),
}
];

export const attendance: Attendance[] = [
  {
    id: "1",
    employeeId: "EMP001",
    employeeName: "Mubasshara",
    checkIn: "08:00 AM",
    date: "2026-06-18",
    status: "Present",
  },
];