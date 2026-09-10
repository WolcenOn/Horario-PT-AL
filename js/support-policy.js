export const SUPPORT_TYPES = Object.freeze(['PT', 'AL']);
export const EXTRACTION_MODES = Object.freeze(['blocked', 'pt', 'al', 'ptal']);
export const EXTRACTION_PREFERENCES = Object.freeze(['preferred', 'neutral', 'avoid']);

const LEGACY_POLICIES = Object.freeze({
  low:{ extraction:'ptal', preference:'preferred', score:30 },
  medium:{ extraction:'ptal', preference:'neutral', score:0 },
  high:{ extraction:'ptal', preference:'avoid', score:-45 },
  blocked:{ extraction:'blocked', preference:'avoid', score:null }
});

const PREFERENCE_SCORES = Object.freeze({
  preferred:30,
  neutral:0,
  avoid:-45
});

export function normalizeSupportPolicy(value) {
  if (typeof value === 'string') {
    return { ...(LEGACY_POLICIES[value] || LEGACY_POLICIES.medium), legacyValue:value };
  }

  const source = value && typeof value === 'object' ? value : {};
  const extraction = EXTRACTION_MODES.includes(source.extraction) ? source.extraction : 'ptal';
  const preference = EXTRACTION_PREFERENCES.includes(source.preference) ? source.preference : 'neutral';
  return {
    extraction,
    preference,
    score:extraction === 'blocked' ? null : PREFERENCE_SCORES[preference],
    legacyValue:null
  };
}

export function canExtractForSupport(value, supportType) {
  const policy = normalizeSupportPolicy(value);
  const type = String(supportType || '').toUpperCase();
  if (!SUPPORT_TYPES.includes(type) || policy.extraction === 'blocked') return false;
  if (policy.extraction === 'ptal') return true;
  return policy.extraction === type.toLowerCase();
}

export function supportPreferenceScore(value) {
  return normalizeSupportPolicy(value).score;
}

export function supportPolicyFromLegacyPriority(value) {
  const policy = normalizeSupportPolicy(value);
  return {
    extraction:policy.extraction,
    preference:policy.preference
  };
}

export function describeSupportPolicy(value) {
  const policy = normalizeSupportPolicy(value);
  const extractionLabel = {
    blocked:'No permite extracción',
    pt:'Solo PT',
    al:'Solo AL',
    ptal:'PT o AL'
  }[policy.extraction];
  const preferenceLabel = {
    preferred:'preferente',
    neutral:'aceptable',
    avoid:'mejor evitar'
  }[policy.preference];
  return policy.extraction === 'blocked'
    ? extractionLabel
    : `${extractionLabel} · ${preferenceLabel}`;
}
