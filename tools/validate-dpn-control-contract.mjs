import fs from "node:fs";

const path = ".dpn/operational-control.json";
const allowedModes = new Set([
  "persistent-service","deployment-observed","release-observed",
  "repository-library","agent-managed","serverless"
]);
const allowedCapabilities = new Set([
  "health_check","collect_diagnostics","repository_security_rescan","ci_validation",
  "prepare_release","deploy_approved_release","rollback_approved_release",
  "restart_service","maintenance_mode","rotate_integration_credential","isolate_service"
]);
const sensitive = ["secret","token","password","private_key","privatekey","api_key","apikey","client_secret"];

function fail(message) {
  console.error("DPN control contract INVALID:", message);
  process.exit(1);
}

const document = JSON.parse(fs.readFileSync(path, "utf8"));
if (document.schema_version !== "1.0") fail("schema_version must be 1.0");
if (!document.product_id || !document.name) fail("product_id and name are required");
if (!document.repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(document.repository.full_name ?? "")) {
  fail("repository.full_name must use owner/name");
}
if (!["A","B","C"].includes(document.security?.tier)) fail("security.tier must be A, B or C");
if (!allowedModes.has(document.runtime?.mode)) fail("runtime.mode is unsupported");
for (const capability of document.runtime?.capabilities ?? []) {
  if (!allowedCapabilities.has(capability)) fail("unsupported capability: " + capability);
}

function walk(value, location = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, location + "[" + index + "]"));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (sensitive.some((part) => lower.includes(part))) {
      fail("credential-like field forbidden at " + location + "." + key);
    }
    walk(child, location + "." + key);
  }
}
walk(document);
console.log("DPN control contract OK:", document.product_id, document.security.tier, document.runtime.mode);
