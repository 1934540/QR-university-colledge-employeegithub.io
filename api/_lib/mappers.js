function mapSchedule(row) {
  return {
    day: row.day,
    subject: row.subject,
    startTime: String(row.start_time || "").slice(0, 5),
    endTime: String(row.end_time || "").slice(0, 5),
    group: row.group_name || ""
  };
}

function mapEmployee(row) {
  return {
    id: row.public_id,
    uid: row.uid,
    name: row.name,
    role: row.role,
    organization: row.organization,
    department: row.department || "",
    studentGroup: row.student_group || "",
    username: row.username,
    avatar: row.avatar || "",
    isVip: Boolean(row.is_vip),
    isActive: row.is_active !== false,
    schedules: Array.isArray(row.schedules) ? row.schedules.map(mapSchedule) : []
  };
}

function mapLog(row) {
  const employee = row.employees || row.employee || {};
  return {
    id: row.uid,
    employeeId: employee.public_id || row.employee_public_id || "",
    employeeUid: employee.uid || row.employee_uid || "",
    employeeName: employee.name || row.employee_name || "",
    role: employee.role || row.role || "",
    organization: employee.organization || row.organization || "",
    date: row.date,
    checkInTime: String(row.check_in_time || "").slice(0, 5),
    checkOutTime: row.check_out_time ? String(row.check_out_time).slice(0, 5) : "",
    workDuration: row.work_duration || "",
    status: row.status,
    details: row.details || ""
  };
}

module.exports = {
  mapEmployee,
  mapLog,
  mapSchedule
};
