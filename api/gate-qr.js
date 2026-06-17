const { supabase, sendJson, methodNotAllowed, handleError } = require("./_lib/supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const { data, error } = await supabase
    .from("gate_qrs")
    .select("*")
    .eq("is_active", true)
    .order("title", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return handleError(res, error, "Failed to load gate QR.");
  return sendJson(res, 200, {
    code: data?.code || "BOLASHAQ-MAIN-GATE-01",
    title: data?.title || "Main gate"
  });
};
