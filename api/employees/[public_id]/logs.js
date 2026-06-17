const { supabase, sendJson, methodNotAllowed, requireAdmin, handleError } = require("../../_lib/supabase");
const { mapLog } = require("../../_lib/mappers");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  if (requireAdmin(req, res)) return null;

  const publicId = String(req.query.public_id || "").trim();
  const employeeResult = await supabase
    .from("employees")
    .select("id")
    .eq("public_id", publicId)
    .eq("is_active", true)
    .maybeSingle();

  if (employeeResult.error) return handleError(res, employeeResult.error, "Failed to load employee.");
  if (!employeeResult.data) return sendJson(res, 404, { detail: "Сотрудник не найден." });

  const { data, error } = await supabase
    .from("attendance_logs")
    .select("*, employees(*)")
    .eq("employee_id", employeeResult.data.id)
    .order("date", { ascending: false })
    .order("check_in_time", { ascending: false })
    .limit(100);

  if (error) return handleError(res, error, "Failed to load employee logs.");
  return sendJson(res, 200, { logs: (data || []).map(mapLog) });
};
