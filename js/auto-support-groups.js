// Proposals only: never mutate staff assignments or PT/AL rosters.
// Enforce shared service, professional, course and *hard* extraction
// policy. Different classes in that course may share a support group;
// per-pupil class restrictions and preferences remain separate in the solver.
const MAX_GROUP_SIZE=8;
const MAX_WEEKLY_SESSIONS=10; // five school days, at most two per day
const LENGTHS=[45,30,15];

function sameHardPolicy(value) {
  return [...(value||[])].sort().join('\u0000');
}

export function proposeAutomaticSupportGroups(candidates) {
  const pools=new Map();
  for(const candidate of candidates) {
    const {person,service,teacherId,remaining,policy}=candidate;
    if (!person?.curso||!person?.grupoClase||!teacherId||
        !Number.isInteger(remaining)||remaining<=0||remaining>900||remaining%15)continue;
    const key=JSON.stringify([
      teacherId,service,person.curso,
      sameHardPolicy(policy?.blocked_subjects)
    ]);
    if(!pools.has(key))pools.set(key,[]);
    pools.get(key).push(candidate);
  }

  const groups=[];
  for(const items of pools.values()) {
    const waiting=[...items].sort((a,b)=>b.remaining-a.remaining);
    for(const length of LENGTHS) {
      const compatible=waiting.filter(item=>
        item.remaining%length===0
        && item.remaining/length<=MAX_WEEKLY_SESSIONS
      );
      // Greedy capped batches: pupils whose targets cannot be fully covered
      // in complete sessions remain candidates for individual scheduling.
      while(compatible.length>=2) {
        const selected=compatible.splice(0,MAX_GROUP_SIZE);
        if(selected.length<2)break;
        groups.push({sessionMinutes:length,members:selected});
        for(const member of selected)waiting.splice(waiting.indexOf(member),1);
      }
    }
  }
  return groups;
}
