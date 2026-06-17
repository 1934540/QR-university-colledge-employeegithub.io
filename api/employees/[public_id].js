const { supabase, sendJson, methodNotAllowed, getJsonBody, requireAdmin, handleError } = require("../_lib/supabase");
const { mapEmployee } = require("../_lib/mappers");

async function loadEmployee(publicId) {
  return supabase
    .from("employees")
    .select("*, schedules(*)")
    .eq("public_id", publicId)
    .maybeSingle();
}

module.exports = async function handler(req, res) {
  if (requireAdmin(req, res)) return null;

  const publicId = String(req.query.public_id || "").trim();
  if (!publicId) return sendJson(res, 400, { detail: "Employee id is required." });

  if (req.method === "PUT" || req.method === "PATCH") {
    const existing = await loadEmployee(publicId);
    if (existing.error) return handleError(res, existing.error, "Failed to load employee.");
    if (!existing.data) return sendJson(res, 404, { detail: "Employee not found." });

    const body = getJsonBody(req);
    const username = String(body.username || existing.data.username || "").trim().toLowerCase();
    const password = String(body.password || existing.data.password || "").trim();

    const updateResult = await supabase
      .from("employees")
      .update({
        name: String(body.name || existing.data.name || "").trim(),
        role: body.role || existing.data.role,
        organization: body.organization || existing.data.organization,
        department: String(body.department ?? existing.data.department ?? "").trim(),
        student_group: String(body.studentGroup ?? body.student_group ?? existing.data.student_group ?? "").trim(),
        username,
        password,
        avatar: String(body.avatar ?? existing.data.avatar ?? "").trim(),
        is_vip: Boolean(body.isVip ?? body.is_vip ?? existing.data.is_vip),
        updated_at: new Date().toISOString()
      })
      .eq("id", existing.data.id)
      .select("*, schedules(*)")
      .single();

    if (updateResult.error) return handleError(res, updateResult.error, "Failed to update employee.");

    const userResult = await supabase
      .from("users")
      .upsert({
        username,
        password,
        role: "employee",
        organization: updateResult.data.organization,
        employee_id: updateResult.data.id,
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: "employee_id" });

    if (userResult.error) return handleError(res, userResult.error, "Failed to update employee user.");

    return sendJson(res, 200, { employee: mapEmployee(updateResult.data) });
  }

  if (req.method === "DELETE") {
    const existing = await loadEmployee(publicId);
    if (existing.error) return handleError(res, existing.error, "Failed to load employee.");
    if (!existing.data) return sendJson(res, 404, { detail: "Employee not found." });

    const deleteResult = await supabase
      .from("employees")
      .delete()
      .eq("id", existing.data.id);

    if (deleteResult.error) return handleError(res, deleteResult.error, "Failed to delete employee.");
    return sendJson(res, 200, { ok: true });
  }

  return methodNotAllowed(res, ["PUT", "PATCH", "DELETE"]);
};
