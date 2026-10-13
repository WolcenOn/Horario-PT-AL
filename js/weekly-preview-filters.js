// Pure, read-only filters for the anonymized weekly timetable comparison.
// Unknown class, staff and room assignments must not be invented.
const str=value=>typeof value==='string'?value:'';
const order=(a,b)=>a.localeCompare(b,'es');

export function weeklyPreviewFilterOptions(projection){
  if(!projection)return {classes:[],teachers:[],rooms:[]};
  const items=(projection.days||[]).flatMap(day=>[...day.current,...day.proposed]);
  const classes=[...new Set(items.flatMap(item=>item.classGroups||[]).filter(Boolean))].sort(order);
  const rooms=[...new Set(items.map(item=>item.room).filter(Boolean))].sort(order);
  const identifiers=[...new Set(items.map(item=>item.teacherId).filter(Boolean))];
  const labels=new Map((projection.teacherOptions||[]).map(row=>[row.id,row.label]));
  const teachers=identifiers.map(id=>({id,label:labels.get(id)||id}))
    .sort((a,b)=>order(a.label,b.label)||order(a.id,b.id));
  return {classes,teachers,rooms};
}

const keep=(row,selection)=>
  (!selection.classGroup||(row.classGroups||[]).includes(selection.classGroup))&&
  (!selection.teacherId||row.teacherId===selection.teacherId)&&
  (!selection.room||row.room===selection.room);

const sumMinutes=rows=>rows.reduce((total,row)=>total+row.duration,0);

export function filterWeeklyPreviewCalendar(projection,selection={}){
  if(!projection)return null;
  const chosen={
    classGroup:str(selection.classGroup),
    teacherId:str(selection.teacherId),
    room:str(selection.room)
  };
  const days=projection.days.map(day=>({
    id:day.id,label:day.label,
    current:day.current.filter(row=>keep(row,chosen)),
    proposed:day.proposed.filter(row=>keep(row,chosen))
  }));
  const current=days.flatMap(day=>day.current);
  const proposed=days.flatMap(day=>day.proposed);
  const currentLessons=current.filter(row=>row.kind==='lesson');
  const proposedLessons=proposed.filter(row=>row.kind==='lesson');
  const actualProposals=proposedLessons.filter(row=>row.source==='proposed');
  const changes={
    same:actualProposals.filter(row=>row.change==='same').length,
    changed:actualProposals.filter(row=>row.change==='changed').length,
    added:actualProposals.filter(row=>row.change==='new').length,
    removed:currentLessons.filter(row=>row.change==='removed').length,
    ambiguous:0
  };
  // Re-filter previously classified rows; never re-pair partial subsets.
  const groups=[...new Set([...currentLessons,...proposedLessons].map(row=>row.context).filter(Boolean))];
  for(const group of groups){
    const subjects=new Set([...currentLessons,...proposedLessons]
      .filter(row=>row.context===group).map(row=>row.label));
    for(const subject of subjects){
      const old=currentLessons.filter(row=>row.context===group&&row.label===subject&&
        row.change==='removed').length;
      const next=proposedLessons.filter(row=>row.context===group&&row.label===subject&&
        row.change==='new').length;
      changes.ambiguous+=Math.min(old,next);
    }
  }
  const classes=groups.sort(order).map(group=>{
    const before=currentLessons.filter(row=>row.context===group);
    const after=proposedLessons.filter(row=>row.context===group);
    return {
      group,currentMinutes:sumMinutes(before),proposedMinutes:sumMinutes(after),
      differenceMinutes:sumMinutes(after)-sumMinutes(before),
      currentSessions:before.length,proposedSessions:after.length
    };
  });
  const supports=['PT','AL'].map(service=>{
    const fixed=proposed.filter(row=>row.kind===service&&row.source==='fixed');
    const additional=proposed.filter(row=>row.kind===service&&row.source==='proposed');
    return {
      service,fixedMinutes:sumMinutes(fixed),
      additionalMinutes:sumMinutes(additional),
      totalMinutes:sumMinutes(fixed)+sumMinutes(additional),
      fixedSessions:fixed.length,additionalSessions:additional.length
    };
  });
  return {
    days,selection:chosen,
    counts:{
      ordinaryCurrent:currentLessons.length,
      ordinaryProposed:actualProposals.length,
      ordinaryRetained:proposedLessons.filter(row=>row.source==='retained').length,
      fixedSupports:proposed.filter(row=>row.source==='fixed').length,
      additionalSupports:proposed.filter(row=>row.kind!=='lesson'&&row.source==='proposed').length
    },
    comparison:{changes,classes,supports},
    visible:{current:current.length,proposed:proposed.length}
  };
}
