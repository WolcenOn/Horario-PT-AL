// Compare only normalized, privacy-minimized weekly blocks. The solver does not
// return stable lesson IDs: an ambiguous one-to-many reshuffle must not be
// labeled as a proven reschedule. No stored timetable is ever mutated.
const sameSlot=(before,after)=>before.context===after.context&&
  before.label===after.label&&before.day===after.day&&
  before.start===after.start&&before.end===after.end&&
  (!before.teacherId||!after.teacherId||before.teacherId===after.teacherId);

const sameSubject=(before,after)=>before.context&&before.label&&
  before.context===after.context&&before.label===after.label;

function countMinutes(blocks){
  return blocks.reduce((total,row)=>total+row.duration,0);
}

export function compareWeeklyPreviewBlocks(
  currentLessons,proposedLessons,fixedSupports,additionalSupports,preservedLessons=[]
){
  const existing=currentLessons.map(row=>({...row,change:'removed'}));
  const proposed=proposedLessons.map(row=>({...row,change:'new'}));
  const matched=new Set();

  // First, reconcile identical positions, including duplicate occurrences,
  // before testing whether one individual lesson clearly moved.
  for(const old of existing){
    const index=proposed.findIndex((next,i)=>!matched.has(i)&&sameSlot(old,next));
    if(index<0)continue;
    matched.add(index);
    old.change='same';
    proposed[index].change='same';
  }

  // Only a unique unmatched old and new lesson of the same class/subject
  // establish an unambiguous correspondence. Otherwise keep additions and
  // removals distinct, especially for split/merged sessions.
  for(const old of existing.filter(row=>row.change==='removed')){
    if(!old.context||!old.label)continue;
    const availableOld=existing.filter(item=>
      item.change==='removed'&&sameSubject(item,old));
    const availableNew=proposed.filter(item=>
      item.change==='new'&&sameSubject(item,old));
    if(availableOld.length===1&&availableNew.length===1){
      old.change='changed';
      availableNew[0].change='changed';
    }
  }

  // Classes outside the solver's requested scope are never treated as
  // removals: their real timetable is retained in both comparisons.
  const retained=preservedLessons.map(row=>({...row,change:'outside'}));
  const current=[...existing,...retained,
    ...fixedSupports.map(row=>({...row,change:'fixed'}))];
  const next=[...proposed,...retained.map(row=>({...row,source:'retained'})),
    ...fixedSupports.map(row=>({...row,change:'fixed'})),
    ...additionalSupports.map(row=>({...row,change:'new'}))];
  const changes={
    same:proposed.filter(row=>row.change==='same').length,
    changed:proposed.filter(row=>row.change==='changed').length,
    added:proposed.filter(row=>row.change==='new').length,
    removed:existing.filter(row=>row.change==='removed').length,
    ambiguous:0
  };
  const groups=new Set([
    ...existing.map(row=>row.context),...proposed.map(row=>row.context),
    ...retained.map(row=>row.context)
  ].filter(Boolean));
  // Entries that cannot be paired 1:1 might be multiple reschedulings,
  // splits or mergers. State the uncertainty, not a fictional equivalence.
  for(const group of groups){
    const subjects=new Set([
      ...existing.filter(row=>row.context===group).map(row=>row.label),
      ...proposed.filter(row=>row.context===group).map(row=>row.label)
    ]);
    for(const subject of subjects){
      const previous=existing.filter(row=>row.context===group&&
        row.label===subject&&row.change==='removed').length;
      const latest=proposed.filter(row=>row.context===group&&
        row.label===subject&&row.change==='new').length;
      if(previous&&latest)changes.ambiguous+=Math.min(previous,latest);
    }
  }
  const classes=[...groups].sort((a,b)=>a.localeCompare(b,'es')).map(group=>{
    const before=[...existing,...retained].filter(row=>row.context===group);
    const after=[...proposed,...retained].filter(row=>row.context===group);
    return {
      group,
      currentMinutes:countMinutes(before),
      proposedMinutes:countMinutes(after),
      differenceMinutes:countMinutes(after)-countMinutes(before),
      currentSessions:before.length,
      proposedSessions:after.length
    };
  });

  // Professional/session-minutes only: a 45-minute group session uses 45
  // minutes of one specialist, not 45 * participant_count pupil-minutes.
  const supports=['PT','AL'].map(service=>{
    const fixed=fixedSupports.filter(row=>row.kind===service);
    const added=additionalSupports.filter(row=>row.kind===service);
    return {
      service,
      fixedMinutes:countMinutes(fixed),
      additionalMinutes:countMinutes(added),
      totalMinutes:countMinutes(fixed)+countMinutes(added),
      fixedSessions:fixed.length,
      additionalSessions:added.length
    };
  });
  return {current,proposed:next,changes,classes,supports};
}
