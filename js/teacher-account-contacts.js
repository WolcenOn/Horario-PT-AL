// Email addresses in local staff profiles are notification contacts, NOT
// authenticated identities. Do not infer user-account existence or verification.
import {normalizeTeacherEmail} from './absence-email.js';

export function auditTeacherAccountContacts(professionals=[]){
  const people=Array.isArray(professionals)?professionals:[];
  const emails=new Map();
  const inspected=people.map(professional=>{
    let email='',valid=true;
    try{email=normalizeTeacherEmail(professional?.email||'');}
    catch{email=String(professional?.email||'').trim();valid=false;}
    const canonical=valid?email.toLocaleLowerCase('en-US'):'';
    if(canonical)emails.set(canonical,(emails.get(canonical)||0)+1);
    return {id:professional?.id||'',name:professional?.nombre||'',email,canonical,valid};
  });
  const entries=inspected.map(({id,name,email,canonical,valid})=>{
    const status=!email?'missing':!valid?'invalid':
      emails.get(canonical)>1?'shared':'contact-only';
    return {id,name,email,status,verified:false,accountLinked:false,
      passwordRecoveryEnabled:false};
  });
  const count=status=>entries.filter(row=>row.status===status).length;
  return {
    entries,
    summary:{
      total:entries.length,contactOnly:count('contact-only'),
      missing:count('missing'),invalid:count('invalid'),shared:count('shared')
    }
  };
}

export function staffContactLabel(status){
  return ({
    missing:'Sin correo profesional',
    invalid:'Formato de correo no válido',
    shared:'Correo compartido: revisar antes de crear una cuenta individual',
    'contact-only':'Contacto disponible; cuenta no vinculada'
  })[status]||'Cuenta no vinculada';
}
