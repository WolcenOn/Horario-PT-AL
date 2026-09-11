const SUBJECT_VISUALS = new Map([
  ['crecimiento en armonia', { abbreviation:'CRE', hue:32 }],
  ['descubrimiento y exploracion del entorno', { abbreviation:'DEE', hue:154 }],
  ['comunicacion y representacion de la realidad', { abbreviation:'CRR', hue:205 }],
  ['psicomotricidad', { abbreviation:'PSI', hue:18 }],
  ['lengua castellana y literatura', { abbreviation:'LEN', hue:210 }],
  ['matematicas', { abbreviation:'MAT', hue:142 }],
  ['conocimiento del medio natural, social y cultural', { abbreviation:'CNM', hue:178 }],
  ['ciencias de la naturaleza', { abbreviation:'CN', hue:112 }],
  ['ciencias sociales', { abbreviation:'CS', hue:38 }],
  ['ingles', { abbreviation:'ING', hue:266 }],
  ['segunda lengua extranjera', { abbreviation:'2LE', hue:235 }],
  ['lengua cooficial y literatura', { abbreviation:'LCO', hue:194 }],
  ['educacion fisica', { abbreviation:'EF', hue:24 }],
  ['educacion artistica', { abbreviation:'EAR', hue:326 }],
  ['musica', { abbreviation:'MUS', hue:346 }],
  ['plastica', { abbreviation:'PLA', hue:292 }],
  ['educacion en valores civicos y eticos', { abbreviation:'VAL', hue:52 }],
  ['religion', { abbreviation:'REL', hue:42 }],
  ['atencion educativa', { abbreviation:'ATE', hue:198 }],
  ['tutoria', { abbreviation:'TUT', hue:218 }]
]);

const STOP_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'en']);

export function subjectVisual(subject) {
  const normalized = normalize(subject);
  const known = SUBJECT_VISUALS.get(normalized);
  if (known) return { ...known };
  return {
    abbreviation:fallbackAbbreviation(subject),
    hue:fallbackHue(normalized)
  };
}

export function subjectAbbreviation(subject) {
  return subjectVisual(subject).abbreviation;
}

export function subjectHue(subject) {
  return subjectVisual(subject).hue;
}

function fallbackAbbreviation(subject) {
  const clean = String(subject || '').trim();
  if (!clean) return 'ASG';
  const words = clean
    .replace(/[()/.·,_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const meaningful = words.filter(word => !STOP_WORDS.has(normalize(word)));
  if (meaningful.length >= 2) {
    return meaningful.slice(0, 4).map(word => firstLetter(word)).join('').toLocaleUpperCase('es');
  }
  const word = meaningful[0] || words[0] || 'ASG';
  return stripMarks(word).replace(/[^a-z0-9]/gi, '').slice(0, 3).toLocaleUpperCase('es') || 'ASG';
}

function fallbackHue(normalized) {
  let hash = 2166136261;
  for (const character of normalized || 'asignatura') {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 360;
}

function normalize(value) {
  return stripMarks(String(value || '').trim().toLocaleLowerCase('es'));
}

function stripMarks(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function firstLetter(value) {
  return stripMarks(String(value || '')).charAt(0);
}
