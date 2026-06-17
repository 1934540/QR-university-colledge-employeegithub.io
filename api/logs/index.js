const { supabase, sendJson, methodNotAllowed, requireAdmin, handleError } = require("../_lib/supabase");
const { mapLog } = require("../_lib/mappers");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  if (requireAdmin(req, res)) return null;

  const { data, error } = await supabase
    .from("attendance_logs")
    .select("*, employees(*)")
    .order("date", { ascending: false })
    .order("check_in_time", { ascending: false })
    .limit(300);

  if (error) return handleError(res, error, "Failed to load logs.");
  return sendJson(res, 200, { logs: (data || []).map(mapLog) });
};
