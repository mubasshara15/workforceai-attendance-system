export interface Attendance {
  id: string;
  employeeId: string;
  employeeName: string;
  checkIn: string;
  checkOut?: string;
  date: string;
  status: 'Present' | 'Absent' | 'Late';
}