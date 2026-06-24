import { AttendanceBoard, type AttendanceBoardData } from "./AttendanceBoard";

export function AttendanceBoardWrapper({ data }: { data: AttendanceBoardData }) {
  return <AttendanceBoard data={data} />;
}
