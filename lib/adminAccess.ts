type AdminSecrets = {
  operator?: string;
  judge?: string;
};

export function isAdminPageAccessConfigured(secrets: AdminSecrets) {
  return Boolean(secrets.operator || secrets.judge);
}

export function isAdminPageSecretValid(secret: string | undefined, secrets: AdminSecrets) {
  if (!isAdminPageAccessConfigured(secrets)) return true;
  return Boolean(secret && (
    secret === secrets.operator ||
    secret === secrets.judge
  ));
}

export function isOperatorSecretValid(secret: string | undefined, operator?: string) {
  if (!operator) return true;
  return secret === operator;
}