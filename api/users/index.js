const { supabase, sendJson, methodNotAllowed, requireAdmin, handleError } = require("../_lib/supabase");

function mapUser(row) {
  return {
    id: row.id,
    uid: row.uid,
    username: row.username,
    role: row.role,
    organization: row.organization || "",
    employeeId: row.employee_id,
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  if (requireAdmin(req, res)) return null;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("role", { ascending: true })
    .order("username", { ascending: true });

  if (error) return handleError(res, error, "Failed to load users.");
  return sendJson(res, 200, { users: (data || []).map(mapUser) });
};
