const { supabase, sendJson, methodNotAllowed, getJsonBody, requireAdmin, handleError } = require("../_lib/supabase");
const { mapEmployee } = require("../_lib/mappers");

module.exports = async function handler(req, res) {
  if (requireAdmin(req, res)) return null;

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("employees")
      .select("*, schedules(*)")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) return handleError(res, error, "Failed to load employees.");
    return sendJson(res, 200, { employees: (data || []).map(mapEmployee) });
  }

  if (req.method === "POST") {
    const body = getJsonBody(req);
    const publicId = String(body.id || body.publicId || body.public_id || "").trim();
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "").trim();

    if (!publicId || !body.name || !username || !password) {
      return sendJson(res, 400, { detail: "Employee id, name, username and password are required." });
    }

    const employeeInsert = await supabase
      .from("employees")
      .insert({
        public_id: publicId,
        name: String(body.name || "").trim(),
        role: body.role || "staff",
        organization: body.organization || "university",
        department: String(body.department || "").trim(),
        student_group: String(body.studentGroup || body.student_group || "").trim(),
        username,
        password,
        password_hash: "",
        avatar: String(body.avatar || "").trim(),
        is_vip: Boolean(body.isVip || body.is_vip),
        is_active: true
      })
      .select("*, schedules(*)")
      .single();

    if (employeeInsert.error) return handleError(res, employeeInsert.error, "Failed to create employee.");

    const userInsert = await supabase
      .from("users")
      .insert({
        username,
        password,
        role: "employee",
        organization: employeeInsert.data.organization,
        employee_id: employeeInsert.data.id,
        is_active: true
      });

    if (userInsert.error) {
      await supabase.from("employees").delete().eq("id", employeeInsert.data.id);
      return handleError(res, userInsert.error, "Failed to create employee user.");
    }

    return sendJson(res, 201, { employee: mapEmployee(employeeInsert.data) });
  }

  return methodNotAllowed(res, ["GET", "POST"]);
};
