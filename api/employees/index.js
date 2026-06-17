const { supabase, sendJson, methodNotAllowed, requireAdmin, handleError } = require("../_lib/supabase");
const { mapEmployee } = require("../_lib/mappers");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  if (requireAdmin(req, res)) return null;

  const { data, error } = await supabase
    .from("employees")
    .select("*, schedules(*)")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) return handleError(res, error, "Failed to load employees.");
  return sendJson(res, 200, { employees: (data || []).map(mapEmployee) });
};
