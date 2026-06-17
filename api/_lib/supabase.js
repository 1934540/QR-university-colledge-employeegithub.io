const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL || "https://pjjcsagviayhioqajzhv.supabase.co";
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "sb_publishable_Pme5rr6mOQWArrrgHT5ovQ_W46DaBLC";

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function methodNotAllowed(res, allowedMethods) {
  res.setHeader("Allow", allowedMethods.join(", "));
  sendJson(res, 405, { detail: "Method not allowed." });
}

function getJsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function isAdminRequest(req) {
  const required = process.env.BOLASHAQ_REQUIRE_ADMIN_API_KEY === "1";
  if (!required) return true;

  const expected = process.env.BOLASHAQ_ADMIN_API_KEY || "";
  const provided = req.headers["x-bolashaq-admin-key"] || "";
  return Boolean(expected && provided === expected);
}

function requireAdmin(req, res) {
  if (isAdminRequest(req)) return false;
  sendJson(res, 401, { detail: "Admin API key is required." });
  return true;
}

function handleError(res, error, fallback = "Supabase request failed.") {
  console.error(fallback, error);
  sendJson(res, 500, { detail: error?.message || fallback });
}

module.exports = {
  supabase,
  sendJson,
  methodNotAllowed,
  getJsonBody,
  requireAdmin,
  handleError
};
