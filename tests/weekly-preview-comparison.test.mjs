import test from 'node:test';
import assert from 'node:assert/strict';
import {compareWeeklyPreviewBlocks} from '../js/weekly-preview-comparison.js';

const block=(context,label,day,start,end,teacherId='')=>({
  kind:'lesson',source:'current',context,label,day,start,end,teacherId,
  duration:60
});

test('la coincidencia exacta consume solo una de varias franjas idénticas',()=>{
  const before=[block('1A','MAT',0,'09:00','10:00'),
    block('1A','MAT',0,'09:00','10:00')];
  const after=[{...before[0],source:'proposed'}];
  const result=compareWeeklyPreviewBlocks(before,after,[],[]);
  assert.deepEqual(result.changes,{
    same:1,changed:0,added:0,removed:1,ambiguous:0
  });
  assert.deepEqual(result.current.map(x=>x.change),['same','removed']);
  assert.deepEqual(result.proposed.map(x=>x.change),['same']);
});

test('detecta un cambio inequívoco de día, hora, duración o docente',()=>{
  const before=[block('1A','MAT',0,'09:00','10:00','teacher-a')];
  const after=[{...before[0],day:1,start:'10:00',end:'11:00',
    teacherId:'teacher-b',source:'proposed',duration:60}];
  const result=compareWeeklyPreviewBlocks(before,after,[],[]);
  assert.deepEqual(result.changes,{
    same:0,changed:1,added:0,removed:0,ambiguous:0
  });
  assert.equal(result.current[0].change,'changed');
  assert.equal(result.proposed[0].change,'changed');
});

test('un cambio de docente no aparece como sesión mantenida aunque conserve la hora',()=>{
  const before=[block('1A','MAT',0,'09:00','10:00','teacher-a')];
  const after=[{...before[0],teacherId:'teacher-b',source:'proposed'}];
  const result=compareWeeklyPreviewBlocks(before,after,[],[]);
  assert.equal(result.changes.same,0);
  assert.equal(result.changes.changed,1);
});

test('distingue las materias nuevas de las retiradas y calcula minutos negativos',()=>{
  const before=[block('1A','MAT',0,'09:00','10:00')];
  const after=[{...block('2B','ING',1,'11:00','12:00'),source:'proposed',duration:45}];
  const result=compareWeeklyPreviewBlocks(before,after,[],[]);
  assert.deepEqual(result.changes,{
    same:0,changed:0,added:1,removed:1,ambiguous:0
  });
  assert.deepEqual(result.classes,[
    {group:'1A',currentMinutes:60,proposedMinutes:0,differenceMinutes:-60,
      currentSessions:1,proposedSessions:0},
    {group:'2B',currentMinutes:0,proposedMinutes:45,differenceMinutes:45,
      currentSessions:0,proposedSessions:1}
  ]);
});

test('varias sesiones reordenadas no se emparejan arbitrariamente',()=>{
  const before=[
    block('1A','MAT',0,'09:00','10:00'),
    block('1A','MAT',1,'09:00','10:00')
  ];
  const after=[
    {...block('1A','MAT',2,'11:00','12:00'),source:'proposed'},
    {...block('1A','MAT',3,'11:00','12:00'),source:'proposed'}
  ];
  const result=compareWeeklyPreviewBlocks(before,after,[],[]);
  assert.deepEqual(result.changes,{
    same:0,changed:0,added:2,removed:2,ambiguous:2
  });
});

test('las sesiones grupales ocupan minutos del profesional, no minutos por alumno',()=>{
  const fixed=[{kind:'PT',source:'fixed',day:0,start:'09:00',
    end:'09:45',duration:45}];
  const additional=[
    {kind:'PT',source:'proposed',day:1,start:'10:00',
      end:'10:30',duration:30,context:'3 participantes'},
    {kind:'AL',source:'proposed',day:1,start:'11:00',
      end:'11:45',duration:45}
  ];
  const r=compareWeeklyPreviewBlocks([],[],fixed,additional);
  assert.deepEqual(r.supports,[
    {service:'PT',fixedMinutes:45,additionalMinutes:30,totalMinutes:75,
      fixedSessions:1,additionalSessions:1},
    {service:'AL',fixedMinutes:0,additionalMinutes:45,totalMinutes:45,
      fixedSessions:0,additionalSessions:1}
  ]);
  assert.deepEqual(r.proposed.map(x=>x.change),['fixed','new','new']);
});

test('la comparación no altera las fuentes ni arrastra información de alumnos',()=>{
  const current=[block('1A','MAT',0,'09:00','10:00')];
  const proposed=[{...current[0],source:'proposed'}];
  const fixed=[{kind:'PT',duration:45,source:'fixed',
    context:'Identidad protegida'}];
  const snapshot=JSON.stringify({current,proposed,fixed});
  const result=compareWeeklyPreviewBlocks(current,proposed,fixed,[]);
  assert.equal(JSON.stringify({current,proposed,fixed}),snapshot);
  assert.ok(!JSON.stringify(result).includes('pupil_token'));
});
