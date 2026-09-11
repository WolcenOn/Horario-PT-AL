import test from 'node:test';
import assert from 'node:assert/strict';

import { subjectAbbreviation, subjectHue, subjectVisual } from '../js/subject-visuals.js';

test('usa abreviaturas cortas y estables para las materias habituales', () => {
  assert.equal(subjectAbbreviation('Lengua Castellana y Literatura'), 'LEN');
  assert.equal(subjectAbbreviation('Matemáticas'), 'MAT');
  assert.equal(subjectAbbreviation('Conocimiento del Medio Natural, Social y Cultural'), 'CNM');
  assert.equal(subjectAbbreviation('Educación Física'), 'EF');
  assert.equal(subjectAbbreviation('Educación Artística'), 'EAR');
  assert.equal(subjectAbbreviation('Inglés'), 'ING');
});

test('cada materia conocida conserva un tono estable y materias distintas usan tonos distintos', () => {
  assert.equal(subjectHue('Lengua Castellana y Literatura'), 210);
  assert.equal(subjectHue('Matemáticas'), 142);
  assert.notEqual(subjectHue('Lengua Castellana y Literatura'), subjectHue('Matemáticas'));
  assert.notEqual(subjectHue('Matemáticas'), subjectHue('Inglés'));
});

test('genera una abreviatura y color deterministas para materias heredadas', () => {
  const first = subjectVisual('Proyecto de Biblioteca Escolar');
  const second = subjectVisual('Proyecto de Biblioteca Escolar');
  assert.equal(first.abbreviation, 'PBE');
  assert.deepEqual(first, second);
  assert.ok(first.hue >= 0 && first.hue < 360);
});
