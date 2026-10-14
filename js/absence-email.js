// Contact addresses are local professional profile data, never solver payload.
// A mailto link creates an editable draft; the application cannot send mail.
const EMAIL=/^[^\s@<>\u0000-\u001f\u007f]+@[^\s@<>\u0000-\u001f\u007f]+\.[^\s@<>\u0000-\u001f\u007f]+$/u;

export function normalizeTeacherEmail(value){
  const email=String(value??'').trim();
  if(!email)return '';
  if(email.length>254||!EMAIL.test(email)||/[?#]/.test(email))
    throw Error('Introduce un correo electrónico válido para el docente.');
  return email;
}

function dateLabel(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))
    throw Error('Fecha no válida para preparar correos.');
  return date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4);
}

export function prepareReviewedTeacherEmails({date,state,adapter,review}){
  if(!review?.approved||!review.rows?.length||
      review.rows.some(row=>!row.confirmed||!row.selected))
    throw Error('Confirma el borrador completo antes de preparar correos.');
  const title=dateLabel(date);
  const localByBackend=new Map(Object.entries(adapter?.report?.mappings?.teachers||{})
    .map(([local,backend])=>[backend,local]));
  const people=new Map((state?.professionals||[]).map(row=>[row.id,row]));
  const groups=new Map((adapter?.configuration?.groups||[])
    .map(row=>[row.id,row.label||row.id]));
  const notices=new Map();
  function add(backendId,role,line){
    const id=localByBackend.get(backendId);
    if(!id||!people.has(id))return;
    if(!notices.has(id))notices.set(id,{id,professional:people.get(id),
      roles:new Set(),lines:[]});
    const current=notices.get(id);
    current.roles.add(role);
    current.lines.push(line);
  }
  for(const item of review.rows){
    const group=item.groupId?(groups.get(item.groupId)||item.groupId):
      'agrupamiento sin clase única';
    const activity=item.kind==='CLASS'?'Clase':'Apoyo '+item.kind;
    const time=(item.start||'')+'–'+(item.end||'');
    const substituteId=localByBackend.get(item.selected);
    const substituteName=people.get(substituteId)?.nombre||'Docente sustituto';
    const core=time+' · '+activity+' · '+group;
    add(item.teacherId,'ausente',core+' → Sustituye: '+substituteName);
    add(item.selected,'sustituto',core+' → Sustitución asignada');
  }
  const drafts=[],missing=[];
  for(const {id,professional,roles,lines} of notices.values()){
    const name=professional.nombre||'Docente';
    let email;
    try{email=normalizeTeacherEmail(professional.email||'');}
    catch{missing.push({id,name,reason:'Correo no válido'});continue;}
    if(!email){missing.push({id,name,reason:'Sin correo registrado'});continue;}
    const role=[...roles];
    const subject='Horario de sustituciones · '+title;
    const body=[
      'Hola '+name+':','',
      'Se ha revisado una propuesta de cobertura para el '+title+'.',
      'Estas son las franjas que te corresponden:','',
      ...lines,'',
      'Importante: este mensaje procede de un borrador revisado localmente.',
      'Confirma con la coordinación del centro cualquier cambio antes de aplicarlo.',
      'No se incluyen datos personales del alumnado.','',
      'Un saludo.'
    ].join('\n');
    drafts.push({id,name,email,role:role.join(' y '),subject,body});
  }
  drafts.sort((a,b)=>a.name.localeCompare(b.name,'es'));
  missing.sort((a,b)=>a.name.localeCompare(b.name,'es'));
  return {drafts,missing,totalPeople:notices.size};
}

export function teacherMailtoLink(draft){
  const email=normalizeTeacherEmail(draft.email);
  if(!email||!draft.subject||!draft.body)throw Error('Faltan datos del correo.');
  return 'mailto:'+encodeURIComponent(email)+
    '?subject='+encodeURIComponent(draft.subject)+
    '&body='+encodeURIComponent(draft.body);
}
