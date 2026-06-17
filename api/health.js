const { sendJson, methodNotAllowed } = require("./_lib/supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  return sendJson(res, 200, {
    ok: true,
    service: "BolashaqQR Node API",
    database: "supabase"
  });
};
