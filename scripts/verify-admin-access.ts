import assert from "node:assert/strict";
import {
  isAdminPageAccessConfigured,
  isAdminPageSecretValid,
  isOperatorSecretValid
} from "@/lib/adminAccess";

const secrets = { operator: "operator-secret", judge: "judge-secret" };

assert.equal(isAdminPageAccessConfigured(secrets), true);
assert.equal(isAdminPageSecretValid("operator-secret", secrets), true);
assert.equal(isAdminPageSecretValid("judge-secret", secrets), true);
assert.equal(isAdminPageSecretValid("wrong", secrets), false);
assert.equal(isOperatorSecretValid("operator-secret", secrets.operator), true);
assert.equal(isOperatorSecretValid("judge-secret", secrets.operator), false);
assert.equal(isAdminPageSecretValid(undefined, {}), true);
assert.equal(isOperatorSecretValid(undefined, undefined), true);

console.log("Admin access verification passed.");