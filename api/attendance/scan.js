const { supabase, sendJson, methodNotAllowed, getJsonBody, handleError } = require("../_lib/supabase");
const { acceptsGateQr, calculateStatus, formatDuration, toDateParts, toPlatformDateParts } = require("../_lib/attendance");
const { mapEmployee, mapLog } = require("../_lib/mappers");

async function findEmployee(employeeId, employeeUid) {
  let query = supabase
    .from("employees")
    .select("*, schedules(*)")
    .eq("is_active", true);

  if (employeeUid) {
    query = query.eq("uid", employeeUid);
  } else {
    query = query.eq("public_id", employeeId);
  }

  return query.maybeSingle();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const body = getJsonBody(req);
  const employeeId = String(body.employeeId || body.employee_id || "").trim();
  const employeeUid = String(body.employeeUid || body.employee_uid || "").trim();
  const qrPayload = String(body.qrPayload || body.qr_payload || "").trim();
  const scannedAt = body.scannedAt || body.scanned_at;

  if (!employeeId && !employeeUid) {
    return sendJson(res, 400, { detail: "Employee id is required." });
  }

  if (!acceptsGateQr(qrPayload)) {
    return sendJson(res, 400, { detail: "Неверный QR входа." });
  }

  const employeeResult = await findEmployee(employeeId, employeeUid);
  if (employeeResult.error) return handleError(res, employeeResult.error, "Failed to load employee.");
  if (!employeeResult.data) return sendJson(res, 404, { detail: "Сотрудник не найден." });

  const employee = employeeResult.data;
  const { date, time, weekday } = toPlatformDateParts(body) || toDateParts(scannedAt);

  const gateResult = await supabase
    .from("gate_qrs")
    .select("*")
    .eq("code", "BOLASHAQ-MAIN-GATE-01")
    .eq("is_active", true)
    .maybeSingle();

  if (gateResult.error) return handleError(res, gateResult.error, "Failed to load gate QR.");

  const existingResult = await supabase
    .from("attendance_logs")
    .select("*, employees(*)")
    .eq("employee_id", employee.id)
    .eq("date", date)
    .maybeSingle();

  if (existingResult.error) return handleError(res, existingResult.error, "Failed to load attendance log.");

  if (!existingResult.data) {
    const status = calculateStatus(employee, employee.schedules || [], time, weekday);
    const insertResult = await supabase
      .from("attendance_logs")
      .insert({
        employee_id: employee.id,
        gate_id: gateResult.data?.id || null,
        date,
        check_in_time: time,
        status: status.status,
        details: status.details
      })
      .select("*, employees(*)")
      .single();

    if (insertResult.error) return handleError(res, insertResult.error, "Failed to create attendance log.");
    return sendJson(res, 200, {
      eventType: "in",
      employee: mapEmployee(employee),
      log: mapLog(insertResult.data)
    });
  }

  if (!existingResult.data.check_out_time) {
    const updateResult = await supabase
      .from("attendance_logs")
      .update({
        gate_id: existingResult.data.gate_id || gateResult.data?.id || null,
        check_out_time: time,
        work_duration: formatDuration(existingResult.data.check_in_time, time),
        updated_at: new Date().toISOString()
      })
      .eq("id", existingResult.data.id)
      .select("*, employees(*)")
      .single();

    if (updateResult.error) return handleError(res, updateResult.error, "Failed to update attendance log.");
    return sendJson(res, 200, {
      eventType: "out",
      employee: mapEmployee(employee),
      log: mapLog(updateResult.data)
    });
  }

  return sendJson(res, 200, {
    eventType: "complete",
    employee: mapEmployee(employee),
    log: mapLog(existingResult.data)
  });
};
