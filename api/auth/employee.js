const { supabase, sendJson, methodNotAllowed, getJsonBody, handleError } = require("../_lib/supabase");
const { mapEmployee } = require("../_lib/mappers");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const body = getJsonBody(req);
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!username || !password) {
    return sendJson(res, 400, { detail: "Введите логин и пароль." });
  }

  const userResult = await supabase
    .from("users")
    .select("*")
    .ilike("username", username)
    .eq("role", "employee")
    .eq("is_active", true)
    .maybeSingle();

  if (userResult.error) return handleError(res, userResult.error, "Failed to login employee.");
  if (!userResult.data || String(userResult.data.password || "") !== password) {
    return sendJson(res, 401, { detail: "Неверный логин или пароль." });
  }

  const employeeResult = await supabase
    .from("employees")
    .select("*, schedules(*)")
    .eq("id", userResult.data.employee_id)
    .eq("is_active", true)
    .maybeSingle();

  if (employeeResult.error) return handleError(res, employeeResult.error, "Failed to load employee.");
  if (!employeeResult.data) {
    return sendJson(res, 404, { detail: "Сотрудник не найден." });
  }

  return sendJson(res, 200, { employee: mapEmployee(employeeResult.data) });
};
