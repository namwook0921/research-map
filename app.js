/* The datasets remain separate; this is a presentation of their shared map. */
const NS = 'http://www.w3.org/2000/svg';
const $ = id => document.getElementById(id);
const svg = $('map');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const model = { nodes: [], edges: [], config: null, entries: [], selected: null, depth: -1, pointer: null };
const camera = { x: 0, y: 350, scale: .15, cx: innerWidth/2 };
const target = { ...camera };
let width = innerWidth, height = innerHeight, fitScale = .15, frame = 0, dragging = false, dragStart = null;

function el(tag, attrs = {}, parent = null) {
  const n = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k,v]) => n.setAttribute(k, v));
  if (parent) parent.appendChild(n);
  return n;
}
function clamp(v,a,b) { return Math.max(a,Math.min(b,v)); }
function wrap(title, limit=23) {
  const words = title.split(/\s+/), lines = []; let line = '';
  for (const w of words) { if ((line+' '+w).trim().length > limit && line) { lines.push(line); line=w; } else line=(line+' '+w).trim(); }
  if (line) lines.push(line);
  return lines;
}
function compactTitle(title) {
  const replacements = {
    'A Simple Framework for Contrastive Learning of Visual Representations (SimCLR)': 'SimCLR',
    'Denoising Diffusion Probabilistic Models': 'DDPM',
    'π*0.6: A VLA That Learns From Experience': 'π*0.6',
    'Learning Latent Dynamics for Planning from Pixels': 'PlaNet',
    'TD-MPC2: Scalable, Robust World Models for Continuous Control': 'TD-MPC2',
    'EquiBot: SIM(3)-Equivariant Diffusion Policy for Generalizable and Data Efficient Learning': 'EquiBot',
    'Recovery RL: Safe Reinforcement Learning with Learned Recovery Zones': 'Recovery RL',
    'DreamGen: Unlocking Generalization in Robot Learning through Video World Models': 'DreamGen',
    'Unsupervised Zero-Shot Reinforcement Learning via Functional Reward Encodings': 'Zero-Shot RL / FB',
    'Information Theory & Representation Learning': 'Information Theory',
    'The Computation of Approximate Generalized Feedback Nash Equilibria': 'Feedback Nash Equilibria',
    'Commitment Without Regrets: Online Learning in Stackelberg Security Games': 'Commitment Without Regrets',
    'A Multiresolution Spline with Application to Image Mosaics': 'Multiresolution Spline',
    'Uncovering Gaps in How Humans and LLMs Interpret Subjective Language': 'Humans, LLMs & Subjectivity',
    'Learning a Diffusion Model Policy from Rewards via Q-Score Matching': 'Q-Score Matching',
    'Diffusion Guidance Is a Controllable Policy Improvement Operator': 'Diffusion Policy Improvement',
    'Uncertainty-aware Latent Safety Filters for Avoiding Out-of-Distribution Failures': 'Latent Safety Filters',
    'Offline Reinforcement Learning: Tutorial, Review, and Perspectives on Open Problems': 'Offline RL Review',
    'Transformer Layer Correction Mechanism (TLCM)': 'TLCM',
    'LLM Layers Immediately Correct Each Other': 'TLCM',
    'Verification of Neural Reachable Tubes via Scenario Optimization and Conformal Prediction': 'Neural Reachable Tubes',
    'RL Token: Bootstrapping Online RL with Vision-Language-Action Models': 'RLT',
    'Diversity is All You Need: Learning Skills without a Reward Function': 'DIAYN',
    'DeepReach: A Deep Learning Approach to High-Dimensional Reachability': 'DeepReach',
    'Dynamics-Aware Unsupervised Discovery of Skills (DADS)': 'DADS',
    'Contrastive Intrinsic Control (CIC)': 'CIC',
    'Lipschitz-Constrained Unsupervised Skill Discovery (LSD)': 'LSD',
    'Direct Preference Optimization: Your Language Model Is Secretly a Reward Model (DPO)': 'DPO',
    'Data-Efficient Hierarchical Reinforcement Learning': 'HIRO'
  };
  return replacements[title] || title;
}

function makeNode(data) {
  const g = el('g', { class: `node ${data.kind}`, role: 'button', tabindex: '0', 'aria-label': `${data.kind}: ${data.title}`, 'data-id': data.id }, $('nodes'));
  g.style.color = data.color;
  const title = el('title', {}, g); title.textContent = data.title;
  const hit = el('ellipse', { class: 'hit' }, g);
  const glow = el('ellipse', { class: 'glow' }, g);
  const surface = el('ellipse', { class: 'surface' }, g);
  if(data.kind!=='entry'){
    const gradId='fill-'+data.id,gradient=el('radialGradient',{id:gradId,cx:'50%',cy:'15%',r:'90%'},svg.querySelector('defs'));
    el('stop',{offset:'0%','stop-color':data.color,'stop-opacity':'.17'},gradient);
    el('stop',{offset:'75%','stop-color':'#0b1928','stop-opacity':'.94'},gradient);
    surface.style.fill=`url(#${gradId})`;
  }
  const shine = el('path', { class: 'shine' }, g);
  const marker = el('path', { class: 'marker' }, g);
  const text = el('text', {}, g);
  const subtitle = el('text', { class: 'sub-label' }, g);
  const dot = el('circle', { r: 2, fill: data.color }, g);
  g.addEventListener('click', e => { e.stopPropagation(); if (!dragging) select(data); });
  g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(data); } });
  const node = { ...data, ox:data.x,oy:data.y,tx:data.x,ty:data.y,g, hit, glow, surface, shine, marker, text, subtitle, dot, lastMode: '' };
  model.nodes.push(node); return node;
}

function makeEdge(a,b,kind='membership') {
  const path = el('path', { class:'edge', stroke: a.color || b.color }, $('edges'));
  const dx=b.x-a.x,dy=b.y-a.y, bend=kind==='cross' ? .14 : .055;
  const mx=(a.x+b.x)/2-dy*bend, my=(a.y+b.y)/2+dx*bend;
  path.setAttribute('d',`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`);
  if(kind==='cross'||kind==='reference') path.setAttribute('stroke-dasharray',kind==='reference'?'2 5':'4 8');
  model.edges.push({a,b,kind,path});
}

function build(config,entries,details=model.details) {
  model.details=details;model.view=model.view||'ontology';
  model.config=config; model.entries=entries;
  model.mobile=width<600;
  const fieldsById=new Map(),topicsById=new Map(),entriesById=new Map();
  const centers=width<600?[[0,-1600],[0,0],[0,1600]]:[[-1350,-550],[1350,-400],[-100,1400]];
  config.fields.forEach((f,i)=>{
    const [x,y]=centers[i], n=makeNode({...f,kind:'field',x,y});fieldsById.set(f.id,n);
    const haze=el('ellipse',{cx:x,cy:y,rx:1050,ry:870,fill:'url(#field-haze)'},$('regions'));haze.style.color=f.color;n.haze=haze;
  });
  config.fields.forEach(f=>{
    const group=config.topics.filter(t=>t.primary_field_id===f.id),field=fieldsById.get(f.id);
    group.forEach((t,i)=>{
      const angle=-Math.PI/2+i/group.length*Math.PI*2;
      const n=makeNode({...t,kind:'topic',color:f.color,x:field.x+Math.cos(angle)*700,y:field.y+Math.sin(angle)*610});
      topicsById.set(t.id,n);makeEdge(field,n);
    });
    const descendants=new Set(config.topics.filter(t=>t.field_ids.includes(f.id)).map(t=>t.id));
    const entryIds=new Set(config.memberships.filter(m=>m.topic_ids.some(id=>descendants.has(id))).map(m=>m.entry_id));
    field.count=descendants.size+entryIds.size;
    field.entryCount=entryIds.size;
  });
  config.topics.forEach(t=>t.field_ids.filter(id=>id!==t.primary_field_id).forEach(id=>makeEdge(fieldsById.get(id),topicsById.get(t.id),'cross')));
  config.fields.forEach((f,i)=>config.fields.slice(i+1).forEach(other=>{
    if(config.topics.some(t=>t.field_ids.includes(f.id)&&t.field_ids.includes(other.id)))makeEdge(fieldsById.get(f.id),fieldsById.get(other.id),'fieldbridge');
  }));
  const membershipById=new Map(config.memberships.map(m=>[m.entry_id,m]));
  config.topics.forEach(t=>{
    const group=entries.filter(e=>membershipById.get(e.id)?.primary_topic_id===t.id).sort((a,b)=>a.kind.localeCompare(b.kind)||a.title.localeCompare(b.title)),topic=topicsById.get(t.id);
    group.forEach((e,i)=>{
      const angle=-Math.PI/2+i/group.length*Math.PI*2, radius=group.length<=2?185:group.length>6?275:235;
      const n=makeNode({...e,kind:'entry',entryKind:e.kind,color:topic.color,x:topic.x+Math.cos(angle)*radius,y:topic.y+Math.sin(angle)*radius*.8});
      n.g.classList.add(e.kind);entriesById.set(e.id,n);makeEdge(topic,n);
    });
    topic.count=new Set(config.memberships.filter(m=>m.topic_ids.includes(t.id)).map(m=>m.entry_id)).size;
  });
  config.memberships.forEach(m=>m.topic_ids.filter(id=>id!==m.primary_topic_id).forEach(id=>makeEdge(topicsById.get(id),entriesById.get(m.entry_id),'cross')));
  entries.forEach(e=>(e.related_paper_ids||[]).forEach(id=>{if(entriesById.has(id))makeEdge(entriesById.get(e.id),entriesById.get(id),'reference');}));
  const fieldCounts=[...fieldsById.values()].map(n=>n.count);
  model.sizeStats={fieldMin:Math.min(...fieldCounts),fieldMax:Math.max(...fieldCounts),topicMax:Math.max(1,...[...topicsById.values()].map(n=>n.count))};
  createMiniMap(); resize(true); setupSearch(); setupTimeline(); wake();
}

// Count unique descendants across solid and dotted memberships. Expand the
// visual range within each depth while keeping the growth curve concave.
function clusterSize(n,depth){
  const stats=model.sizeStats;
  if(n.kind==='field'){
    const lo=Math.sqrt(stats.fieldMin),hi=Math.sqrt(stats.fieldMax);
    const fraction=hi===lo?.5:clamp((Math.sqrt(n.count)-lo)/(hi-lo),0,1);
    const viewport=clamp(width/800,.82,1);
    const compact=!!model.selected&&n.id!==model.selected.id;
    const context=compact?.60:depth===0?1:.88;
    return {rx:(136+38*fraction)*viewport*context,ry:(48+16*fraction)*viewport*context};
  }
  const fraction=Math.sqrt(Math.max(0,n.count||0)/stats.topicMax);
  const context=model.selected?.kind==='field'?clamp(width/850,.86,1):1;
  if(model.selected?.kind==='topic'&&n.id===model.selected.id){
    return {rx:(112+36*fraction)*clamp(width/650,.78,1),ry:42+14*fraction};
  }
  return {rx:(50+62*fraction)*context,ry:(22+23*fraction)*context};
}

function paintNode(n,depth) {
  const isEntry=n.kind==='entry', active=n.kind==='field'||(n.kind==='topic'&&depth>=1)||(isEntry&&depth===2);
  const dimensions=isEntry?{rx:n.focusRx||83,ry:n.focusRy||31}:clusterSize(n,depth);
  let {rx,ry}=dimensions,mode=n.kind+depth+!!model.selected+width;
  if(model.selected&&width<600&&isEntry){rx=Math.min(rx,(width-36)/4);}
  n.g.classList.toggle('compact',!!model.selected&&n.kind==='field'&&n.id!==model.selected.id);
  n.g.setAttribute('transform',`translate(${n.x} ${n.y}) scale(${1/camera.scale})`);
  if(n.haze){n.haze.setAttribute('cx',n.x);n.haze.setAttribute('cy',n.y);}
  const related=!model.selected||n.id===model.selected.id||model.focusedTopicIds?.has(n.id)||model.connectedFieldIds?.has(n.id)||model.edges.some(e=>(e.a.id===model.selected.id&&e.b.id===n.id)||(e.b.id===model.selected.id&&e.a.id===n.id));
  n.g.style.opacity=related?1:.10;
  n.g.style.pointerEvents=active?'auto':'none';
  n.g.setAttribute('tabindex',active?'0':'-1');
  n.g.setAttribute('aria-hidden',active?'false':'true');
  if(n.lastMode!==mode){
    n.lastMode=mode;
    [n.hit,n.glow,n.surface].forEach(e=>{e.setAttribute('rx',rx);e.setAttribute('ry',ry);e.style.display=active?'':'none';});
    n.shine.setAttribute('d',`M ${-rx*.75} ${-ry*.56} Q 0 ${-ry*1.15} ${rx*.75} ${-ry*.56}`);n.shine.style.display=active?'':'none';
    n.dot.style.display=active?'none':'';
    n.dot.setAttribute('r',n.kind==='topic'?2.6:1.4);
    n.text.replaceChildren();n.subtitle.textContent='';n.text.style.display=active?'':'none';n.subtitle.style.display=active?'':'none';
    if(active){
      n.text.style.fontSize=isEntry&&rx<65?'10px':'';
      const name=isEntry?compactTitle(n.title):n.title,lines=wrap(name,isEntry?Math.floor(rx*.29):n.kind==='field'?(n.g.classList.contains('compact')?18:22):Math.floor(rx*.31));
      const shown=lines.slice(0,2);if(lines.length>2)shown[1]=shown[1].replace(/\s+\S*$/,'')+'…';
      shown.forEach((line,i)=>{const t=el('tspan',{x:0,y:(i-(shown.length-1)/2)*(n.kind==='field'&&!n.g.classList.contains('compact')?22:15)+(isEntry?-2:4)},n.text);t.textContent=line;});
      n.subtitle.setAttribute('x',0);n.subtitle.setAttribute('y',isEntry?23:n.kind==='field'?32:21);
      n.subtitle.textContent=isEntry&&!(model.selected&&width<600&&n.focusRy<27)?(n.entryKind==='study'?'STUDY':n.year?'PAPER · '+n.year:'PAPER'):'';
      n.marker.style.display=isEntry?'':'none';
      const markerX=-rx+12;
      n.marker.setAttribute('d',n.entryKind==='study'?`M ${markerX} -3 l 4 -4 l 4 4 l -4 4 Z`:`M ${markerX} -7 h 6 l 3 3 v 10 h -9 Z M ${markerX+6} -7 v 3 h 3`);
    }else n.marker.style.display='none';
  }
}

function render(){
  const fieldSelected=model.selected?.kind==='field';
  const sharedTopics=fieldSelected?model.config.topics.filter(t=>t.field_ids.includes(model.selected.id)):[];
  model.focusedTopicIds=new Set(sharedTopics.map(t=>t.id));
  model.connectedFieldIds=new Set(sharedTopics.flatMap(t=>t.field_ids));
  $('camera').setAttribute('transform',`translate(${camera.cx-camera.x*camera.scale} ${height/2-camera.y*camera.scale}) scale(${camera.scale})`);
  const ratio=camera.scale/fitScale,depth=Math.max(model.selected?.kind==='field'?1:model.selected?.kind==='topic'||model.selected?.kind==='entry'?2:0,ratio<2.05?0:ratio<4.7?1:2);
  if(depth!==model.depth){
    model.depth=depth;
    document.querySelectorAll('[data-depth]').forEach(b=>{const active=+b.dataset.depth===depth;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
    $('depth-caption').textContent=['The whole map','Explore topic clusters','Papers & study entries'][depth];
    $('map-status').textContent=['Broad fields','Topic clusters','Individual papers and studies'][depth];
  }
  $('intro').classList.toggle('dismissed',ratio>1.4||!!model.selected);
  model.nodes.forEach(n=>paintNode(n,depth));
  model.edges.forEach(e=>{
    const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,bend=e.kind==='cross'?.14:.055;
    e.path.setAttribute('d',`M ${e.a.x} ${e.a.y} Q ${(e.a.x+e.b.x)/2-dy*bend} ${(e.a.y+e.b.y)/2+dx*bend} ${e.b.x} ${e.b.y}`);
    const picked=model.selected&&(e.a.id===model.selected.id||e.b.id===model.selected.id);
    const sharedFieldLink=fieldSelected&&e.a.kind==='field'&&e.b.kind==='topic'&&model.focusedTopicIds.has(e.b.id)&&e.a.id!==model.selected.id;
    const hidesFieldLink=model.selected?.kind==='topic'&&(e.a.kind==='field'||e.b.kind==='field');
    const visible=!hidesFieldLink&&(sharedFieldLink|| (e.kind==='fieldbridge'?depth===0:e.kind==='membership'?(e.b.kind==='topic'?depth>=1:depth===2):!!picked));
    e.path.style.opacity=visible?(sharedFieldLink?.72:picked?.83:model.selected?.035:e.kind==='fieldbridge'?.22:e.b.kind==='topic'?.28:.32):0;
    e.path.setAttribute('stroke-width',picked||sharedFieldLink?1.5:1);
    e.path.setAttribute('stroke-dasharray',sharedFieldLink||e.kind==='cross'?'4 8':e.kind==='reference'?'2 5':'');
    e.path.setAttribute('data-shared-field-link',sharedFieldLink?'true':'false');
  });
  updateMiniMap();
}
function tick(){
  frame=0;let moving=false;
  ['x','y','scale','cx'].forEach(k=>{const d=target[k]-camera[k];if(Math.abs(d)>(k==='scale'?.00005:.15)){camera[k]+=d*(reducedMotion?1:.16);moving=true;}else camera[k]=target[k];});
  model.nodes.forEach(n=>['x','y'].forEach(k=>{const d=n['t'+k]-n[k];if(Math.abs(d)>.15){n[k]+=d*(reducedMotion?1:.13);moving=true;}else n[k]=n['t'+k];}));
  render();if(moving)wake();
}
function wake(){if(!frame)frame=requestAnimationFrame(tick);}
function resize(initial=false){
  width=document.querySelector('.atlas').clientWidth;height=document.querySelector('.atlas').clientHeight;
  if(!initial&&model.config&&model.mobile!==(width<600)){
    const {config,entries}=model;model.nodes=[];model.edges=[];model.depth=-1;model.selected=null;
    EntryInspector.close();
    ['nodes','edges','regions','mini-map'].forEach(id=>$(id).replaceChildren());$('selection').hidden=true;
    build(config,entries);return;
  }
  const previous=fitScale;fitScale=width<600?Math.min((width-40)/2100,(height-250)/5400):Math.min((width-100)/5100,(height-200)/3750);fitScale=Math.max(.035,fitScale);
  camera.cx=target.cx=EntryInspector.mapCenter(width);
  if(initial||Math.abs(target.scale-previous)<.03){camera.scale=target.scale=fitScale;camera.x=target.x=0;camera.y=target.y=width<600?0:350;}
  drawStars();if(model.view==='timeline')requestAnimationFrame(layoutTimeline);wake();
}
function zoom(factor, px=width/2, py=height/2){
  const old=target.scale,next=clamp(old*factor,fitScale*.8,fitScale*22);
  if(model.selected&&next<fitScale*(model.selected.kind==='field'?1.9:4.4))clearSelection();
  const wx=target.x+(px-target.cx)/old,wy=target.y+(py-height/2)/old;
  target.x=wx-(px-target.cx)/next;target.y=wy-(py-height/2)/next;target.scale=next;wake();
}
function clearSelection(){model.selected=null;model.activeTopicId=null;document.querySelectorAll('.timeline-entry.selected').forEach(b=>b.classList.remove('selected'));model.nodes.forEach(n=>{n.g.classList.remove('selected');n.tx=n.ox;n.ty=n.oy;n.focusRx=null;n.focusRy=null;n.lastMode='';});$('selection').hidden=true;EntryInspector.close();target.cx=width/2;wake();}
function home(){clearSelection();Object.assign(target,{x:0,y:width<600?0:350,scale:fitScale});wake();}
function select(data){
  const node=model.nodes.find(n=>n.id===data.id);if(!node)return;
  if(model.view==='timeline'){
    if(node.kind==='entry'){selectTimelineEntry(node);return;}
    setView('ontology',false);
  }
  const keepTopic=node.kind==='entry'&&model.activeTopicId&&model.config.memberships.some(m=>m.entry_id===node.id&&m.topic_ids.includes(model.activeTopicId));
  const focusX=keepTopic?node.tx:node.ox,focusY=keepTopic?node.ty:node.oy;
  model.selected=node;
  model.nodes.forEach(n=>{n.g.classList.toggle('selected',n.id===node.id);if(!keepTopic){n.tx=n.ox;n.ty=n.oy;n.focusRx=null;n.focusRy=null;}n.lastMode='';});
  model.activeTopicId=node.kind==='topic'?node.id:keepTopic?model.activeTopicId:null;
  $('selection-kind').textContent=node.kind==='entry'?node.entryKind:node.kind;
  $('selection-title').textContent=node.title;$('selection').hidden=true;
  if(node.kind==='entry')EntryInspector.open(node,{onClose:clearSelection,onSelect:id=>{const next=model.nodes.find(n=>n.id===id);if(next)select(next);},memberships:model.config.memberships,topics:model.config.topics,entries:model.entries});
  else EntryInspector.close();
  target.cx=EntryInspector.mapCenter(width);
  target.x=focusX;target.scale=fitScale*(node.kind==='field'?3.05:7.3);target.y=focusY;
  if(node.kind==='entry'&&width<520)target.y=focusY+(height/2-145)/target.scale;
  focusNeighborhood(node);wake();
}

function focusNeighborhood(selected){
  if(!['field','topic'].includes(selected.kind))return;
  const put=(n,x,y)=>{n.tx=target.x+(x-target.cx)/target.scale;n.ty=target.y+(y-height/2)/target.scale;};
  const topicFocus=selected.kind==='topic';
  const topics=topicFocus?[]:model.config.topics.filter(t=>t.field_ids.includes(selected.id));
  const memberships=topicFocus?model.config.memberships.filter(m=>m.topic_ids.includes(selected.id)):[];
  const primaryIds=new Set(memberships.filter(m=>m.primary_topic_id===selected.id).map(m=>m.entry_id));
  const leafIds=new Set(topicFocus?memberships.map(m=>m.entry_id):topics.map(t=>t.id));
  const leaves=model.nodes.filter(n=>leafIds.has(n.id));
  const inner=leaves.filter(n=>topicFocus?primaryIds.has(n.id):n.primary_field_id===selected.id);
  const outer=leaves.filter(n=>!inner.includes(n));
  const topInset=width<=1050?180:110,bottomInset=95;
  const layoutCy=(topInset+height-bottomInset)/2;
  // Direct memberships sit inside; cross-topic memberships occupy the outer ring.
  const entryRx=topicFocus?clamp((width-48)*.105*Math.min(1,14/leaves.length),50,70):78;
  const maxTopicRx=Math.max(50,...leaves.map(n=>clusterSize(n,1).rx));
  const outerRx=Math.max(90,width/2-(topicFocus?entryRx+22:maxTopicRx+18));
  const outerRy=Math.max(95,(height-topInset-bottomInset)/2-37);
  const innerRatio=topicFocus?(inner.length>=7?.94:outer.length?.83:.92):.86;
  const innerRx=outerRx*innerRatio,innerRy=outerRy*(topicFocus?(inner.length>=7?.84:outer.length?.65:.84):.67);
  target.y=selected.oy-(layoutCy-height/2)/target.scale;
  const selectedSize=clusterSize(selected,topicFocus?2:1);
  const placed=[{x:0,y:0,rx:selectedSize.rx,ry:selectedSize.ry}];
  const arrange=(group,rx,ry,phase)=>{
    group.sort((a,b)=>a.title.localeCompare(b.title));
    group.forEach((n,i)=>{
      const preferred=phase+i/group.length*Math.PI*2;
      const nodeRx=topicFocus?entryRx:clusterSize(n,1).rx;
      const nodeRy=topicFocus?26:clusterSize(n,1).ry;
      const ringRx=topicFocus?rx:Math.max(90,width/2-nodeRx-18)*(group===inner?.98:1);
      let angle=preferred,best=Infinity;
      for(let step=0;step<144;step++){
        const candidate=step/144*Math.PI*2,px=Math.cos(candidate)*ringRx,py=Math.sin(candidate)*ry;
        const clearance=Math.min(...placed.map(p=>Math.hypot((px-p.x)/(nodeRx+p.rx+7),(py-p.y)/(nodeRy+p.ry+7))));
        const distance=Math.abs(Math.atan2(Math.sin(candidate-preferred),Math.cos(candidate-preferred)));
        const score=Math.max(0,1-clearance)*1000+distance;
        if(score<best){best=score;angle=candidate;}
      }
      const x=Math.cos(angle)*ringRx,y=Math.sin(angle)*ry;placed.push({x,y,rx:nodeRx,ry:nodeRy});
      n.focusRx=topicFocus?nodeRx:null;n.focusRy=topicFocus?nodeRy:null;put(n,target.cx+x,layoutCy+y);
    });
  };
  arrange(inner,innerRx,innerRy,-Math.PI/2);
  arrange(outer,outerRx,outerRy,-Math.PI/2-Math.PI/8);
  model.focusedLeafIds=leafIds;
}

svg.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(clamp(e.deltaY,-140,140)*(e.ctrlKey?-.008:.0028)),e.clientX,e.clientY);},{passive:false});
const pointers=new Map();let pinch=null;
svg.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  dragStart={x:e.clientX,y:e.clientY,cx:target.x,cy:target.y};dragging=false;
  if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y)};}
});
svg.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2){const[a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(pinch){zoom(distance/pinch.distance,(a.x+b.x)/2,(a.y+b.y)/2);pinch.distance=distance;}dragging=true;return;}
  if(dragStart){const dx=e.clientX-dragStart.x,dy=e.clientY-dragStart.y;if(Math.hypot(dx,dy)>5)dragging=true;
    if(dragging){svg.setPointerCapture(e.pointerId);svg.classList.add('dragging');target.x=dragStart.cx-dx/target.scale;target.y=dragStart.cy-dy/target.scale;camera.x=target.x;camera.y=target.y;wake();}}
});
function release(e){pointers.delete(e.pointerId);svg.classList.remove('dragging');pinch=null;if(!pointers.size){dragStart=null;setTimeout(()=>dragging=false,0);}else{const p=[...pointers.values()][0];dragStart={...p,cx:target.x,cy:target.y};}}
svg.addEventListener('pointerup',release);svg.addEventListener('pointercancel',release);
svg.addEventListener('click',e=>{if(!dragging&&e.target===svg)clearSelection();});
document.querySelectorAll('[data-depth]').forEach(b=>b.addEventListener('click',()=>{const d=+b.dataset.depth;if(d===0)home();else{if(d===1&&model.selected?.kind!=='field')clearSelection();if(model.selected&&model.selected.kind!=='entry'){target.x=model.selected.x;target.y=model.selected.y;}target.scale=fitScale*[1,3.05,7.3][d];wake();}}));
$('home').addEventListener('click',home);$('brand').addEventListener('click',e=>{e.preventDefault();home();});
$('zoom-in').addEventListener('click',()=>zoom(1.5));$('zoom-out').addEventListener('click',()=>zoom(1/1.5));$('clear-selection').addEventListener('click',clearSelection);
window.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,[contenteditable]'))return;if(e.key==='Escape')clearSelection();else if(e.key==='+'||e.key==='=')zoom(1.4);else if(e.key==='-')zoom(1/1.4);else if(e.key==='0')home();});
window.addEventListener('resize',()=>resize());

let miniViewport;
function createMiniMap(){
  const m=el('svg',{viewBox:width<600?'-1100 -2700 2200 5400':'-2550 -1500 5100 3750'},$('mini-map'));
  model.nodes.forEach(n=>{if(n.kind==='field')el('ellipse',{cx:n.x,cy:n.y,rx:250,ry:150,fill:n.color,opacity:.5},m);else if(n.kind==='topic')el('circle',{cx:n.x,cy:n.y,r:28,fill:n.color,opacity:.55},m);});
  miniViewport=el('rect',{fill:'#b3cceb', 'fill-opacity':'.03',stroke:'#b3cceb','stroke-width':30,rx:80},m);
}
function updateMiniMap(){if(miniViewport){miniViewport.setAttribute('x',camera.x-camera.cx/camera.scale);miniViewport.setAttribute('y',camera.y-height/2/camera.scale);miniViewport.setAttribute('width',camera.cx*2/camera.scale);miniViewport.setAttribute('height',height/camera.scale);}}
function drawStars(){
  const canvas=$('stars'),ctx=canvas.getContext('2d'),dpr=Math.min(devicePixelRatio,2);canvas.width=width*dpr;canvas.height=height*dpr;ctx.scale(dpr,dpr);
  let seed=42067;const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  for(let i=0;i<Math.floor(width*height/3800);i++){const x=random()*width,y=random()*height,r=random()>.96?1.5:.3+random()*.55;ctx.fillStyle=`rgba(160,193,220,${.12+random()*.28})`;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
}

function setupSearch(){
  if(model.searchReady)return;model.searchReady=true;
  const input=$('atlas-search'),box=$('atlas-search-box'),results=$('search-results'),list=$('search-list'),badge=$('search-type'),clear=$('search-clear');
  let matches=[],active=-1;
  const normalize=t=>t.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const close=()=>{results.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;};
  const setActive=i=>{
    active=i;[...list.children].forEach((el,j)=>{el.classList.toggle('active',j===i);el.setAttribute('aria-selected',String(j===i));});
    if(i>=0){input.setAttribute('aria-activedescendant','search-option-'+i);list.children[i]?.scrollIntoView({block:'nearest'});}
    else input.removeAttribute('aria-activedescendant');
  };
  const choose=n=>{select(n);input.value=compactTitle(n.title);badge.textContent='('+n.kind+')';badge.hidden=false;clear.hidden=false;close();input.blur();};
  const update=()=>{
    const query=normalize(input.value.trim());badge.hidden=true;clear.hidden=!input.value;list.replaceChildren();
    if(!query){matches=[];close();return;}
    const words=query.split(/\s+/);
    matches=model.nodes.map(n=>{const title=normalize(n.title),short=normalize(compactTitle(n.title));
      const text=title+' '+short+' '+n.kind+' '+(n.entryKind||'');
      return {n,score:title===query||short===query?0:title.startsWith(query)||short.startsWith(query)?1:2,text};
    }).filter(m=>words.every(w=>m.text.includes(w))).sort((a,b)=>a.score-b.score||['field','topic','entry'].indexOf(a.n.kind)-['field','topic','entry'].indexOf(b.n.kind)||a.n.title.localeCompare(b.n.title)).slice(0,12).map(m=>m.n);
    $('search-status').textContent=matches.length?'Select a result to explore':'No matches. Try another title or topic.';
    matches.forEach((n,i)=>{
      const option=document.createElement('button');option.type='button';option.id='search-option-'+i;option.className='search-option';option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.style.setProperty('--result-color',n.color);
      const icon=document.createElement('span');icon.className='search-node-dot';icon.setAttribute('aria-hidden','true');
      const title=document.createElement('span');title.className='search-result-name';title.textContent=n.title;
      const type=document.createElement('span');type.className='search-result-type';type.textContent='('+n.kind+')';
      option.append(icon,title,type);option.addEventListener('click',()=>choose(n));list.appendChild(option);
    });
    results.hidden=false;input.setAttribute('aria-expanded','true');setActive(-1);
  };
  input.addEventListener('input',update);input.addEventListener('focus',update);
  input.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(results.hidden)update();if(matches.length)setActive(active<0?(e.key==='ArrowDown'?0:matches.length-1):(active+(e.key==='ArrowDown'?1:-1)+matches.length)%matches.length);}
    else if(e.key==='Enter'&&matches.length&&!results.hidden){e.preventDefault();choose(matches[active<0?0:active]);}
    else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();input.blur();}
  });
  clear.addEventListener('click',()=>{input.value='';badge.hidden=true;clear.hidden=true;close();input.focus();});
  document.addEventListener('pointerdown',e=>{if(!box.contains(e.target))close();});
  document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();input.focus();input.select();}});
}

function studiedMonth(entry){
  const dates=(entry.sessions||[]).map(s=>s.first_discussed_date).filter(Boolean).sort();
  return entry.studied_month||(dates[0]?dates[0].slice(0,7):null);
}
function formatStudyMonth(value){
  if(!value)return 'Undated';
  return new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T12:00:00Z'));
}
function setupTimeline(){
  if(model.timelineReady)return;model.timelineReady=true;
  const membershipById=new Map(model.config.memberships.map(m=>[m.entry_id,m]));
  const topicsById=new Map(model.config.topics.map(t=>[t.id,t]));
  const months=new Map();
  model.entries.forEach(entry=>{
    const month=studiedMonth(model.details[entry.id])||'undated';
    const membership=membershipById.get(entry.id),fieldId=topicsById.get(membership.primary_topic_id).primary_field_id;
    if(!months.has(month))months.set(month,[]);months.get(month).push({...entry,fieldId});
  });
  const chronologicalDate=entry=>{
    const dates=(model.details[entry.id].sessions||[]).map(s=>s.first_discussed_date).filter(Boolean).sort();
    return model.details[entry.id].studied_month||dates[0]||'9999';
  };
  const roots=new Map(model.config.fields.map(f=>[f.id,[...months.values()].flat().filter(e=>e.fieldId===f.id).sort((a,b)=>chronologicalDate(a).localeCompare(chronologicalDate(b))||a.title.localeCompare(b.title))[0]?.id]));
  model.timelineRoots=roots;
  const make=(tag,className,text,parent)=>{
    const n=document.createElement(tag);if(className)n.className=className;if(text)n.textContent=text;if(parent)parent.appendChild(n);return n;
  };
  const legend=make('div','timeline-field-legend',null,$('timeline-view'));
  model.config.fields.forEach(f=>{const label=make('span','',f.title,legend);label.style.setProperty('--field-color',f.color);});
  [...months].sort(([a],[b])=>a.localeCompare(b)).forEach(([month,entries])=>{
    const group=make('section','timeline-month',null,$('timeline-months'));group.setAttribute('aria-label',formatStudyMonth(month==='undated'?null:month));group.dataset.month=month;
    const columns=Math.max(...model.config.fields.map(f=>{
      const groupEntries=entries.filter(e=>e.fieldId===f.id),rootHere=groupEntries.some(e=>e.id===roots.get(f.id));
      return rootHere?1+Math.ceil((groupEntries.length-1)/2):Math.ceil(groupEntries.length/2);
    }));
    group.style.width=(Math.max(1,columns)*235+90)+'px';
    const date=make('h2','timeline-date',null,group);
    if(month==='undated')make('span','','Undated',date);
    else{make('span','timeline-month-name',new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z')),date);make('span','timeline-year',month.slice(0,4),date);}
    const lanes=make('div','timeline-lanes',null,group);
    const sorted=entries.sort((a,b)=>{
      const da=model.details[a.id].sessions?.map(s=>s.first_discussed_date).filter(Boolean).sort()[0]||month;
      const db=model.details[b.id].sessions?.map(s=>s.first_discussed_date).filter(Boolean).sort()[0]||month;
      return da.localeCompare(db)||a.title.localeCompare(b.title);
    });
    const fieldSlots=new Map();
    sorted.forEach((entry,i)=>{
      const field=model.config.fields.find(f=>f.id===entry.fieldId);
      const button=make('button','timeline-entry '+entry.kind,null,lanes);button.type='button';button.dataset.entryId=entry.id;const isRoot=roots.get(entry.fieldId)===entry.id;
      const slot=fieldSlots.get(entry.fieldId)||0;fieldSlots.set(entry.fieldId,slot+1);
      button.dataset.slot=slot;button.dataset.fieldId=entry.fieldId;button.dataset.isRoot=String(isRoot);if(isRoot)button.classList.add('timeline-root');button.title=entry.title;button.style.setProperty('--field-color',field.color);button.setAttribute('aria-label',entry.title+' — '+formatStudyMonth(month==='undated'?null:month));
      make('span','timeline-entry-icon',entry.kind==='paper'?'▤':'◇',button);
      const label=make('span','timeline-entry-label',null,button);
      make('span','timeline-entry-title',compactTitle(entry.title),label);make('span','timeline-entry-kind',(isRoot?'ROOT · ':'')+(entry.kind==='paper'?'Paper':'Study')+' · '+(month==='undated'?'Undated':new Intl.DateTimeFormat('en-US',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z'))),label);
      button.addEventListener('click',()=>select(model.nodes.find(n=>n.id===entry.id)));
    });
  });
  const stage=$('timeline-stage');let pan=null;
  stage.addEventListener('wheel',e=>{
    if(e.ctrlKey)return;
    if(Math.abs(e.deltaY)>Math.abs(e.deltaX)){e.preventDefault();stage.scrollLeft+=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?stage.clientWidth:1);}
  },{passive:false});
  stage.addEventListener('pointerdown',e=>{if(e.button===0&&e.pointerType==='mouse'&&!e.target.closest('button'))pan={x:e.clientX,left:stage.scrollLeft,id:e.pointerId};});
  stage.addEventListener('pointermove',e=>{if(!pan||e.pointerId!==pan.id)return;if(Math.abs(e.clientX-pan.x)>4){stage.setPointerCapture(e.pointerId);stage.classList.add('panning');stage.scrollLeft=pan.left+pan.x-e.clientX;}});
  const finishPan=()=>{pan=null;stage.classList.remove('panning');};
  stage.addEventListener('pointerup',finishPan);stage.addEventListener('pointercancel',finishPan);stage.addEventListener('lostpointercapture',finishPan);
  const travel=direction=>stage.scrollBy({left:direction*stage.clientWidth*.8,behavior:reducedMotion?'auto':'smooth'});
  $('timeline-earlier').addEventListener('click',()=>travel(-1));$('timeline-later').addEventListener('click',()=>travel(1));
  stage.addEventListener('keydown',e=>{
    if(e.target!==stage)return;
    if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();travel(e.key==='ArrowRight'?1:-1);}
    else if(e.key==='Home'||e.key==='End'){e.preventDefault();stage.scrollTo({left:e.key==='Home'?0:stage.scrollWidth,behavior:reducedMotion?'auto':'smooth'});}
  });
  stage.addEventListener('scroll',()=>{
    $('timeline-earlier').disabled=stage.scrollLeft<2;
    $('timeline-later').disabled=stage.scrollLeft+stage.clientWidth>=stage.scrollWidth-2;
  },{passive:true});
  $('view-ontology').addEventListener('click',()=>setView('ontology'));
  $('view-timeline').addEventListener('click',()=>setView('timeline'));
}
function layoutTimeline(){
  if(model.view!=='timeline')return;
  const stage=$('timeline-stage'),world=$('timeline-world'),branches=$('timeline-branches');
  const groups=[...document.querySelectorAll('.timeline-month')];
  const total=groups.reduce((sum,g)=>sum+parseFloat(g.style.width),0)+80;
  const graphHeight=stage.clientHeight-12;
  if(graphHeight<=0)return;
  world.style.width=total+'px';world.style.height=graphHeight+'px';
  branches.setAttribute('width',total);branches.setAttribute('height',graphHeight);branches.setAttribute('viewBox',`0 0 ${total} ${graphHeight}`);branches.replaceChildren();
  const defs=el('defs',{},branches),glow=el('filter',{id:'time-glow',x:'-25%',y:'-100%',width:'150%',height:'300%'},defs);el('feGaussianBlur',{stdDeviation:'3'},glow);
  const rowHeight=(graphHeight-40)/3;
  const positions=[];let start=40;
  groups.forEach(group=>{
    el('line',{x1:start+18,y1:33,x2:start+18,y2:graphHeight-8,class:'time-date-guide'},branches);
    const entries=[...group.querySelectorAll('.timeline-entry')];
    model.config.fields.forEach((field,fieldIndex)=>{
      const leaves=entries.filter(e=>e.dataset.fieldId===field.id);
      const rootHere=leaves.some(e=>e.dataset.isRoot==='true');
      leaves.forEach(button=>{
        const isRoot=button.dataset.isRoot==='true';
        const slot=+button.dataset.slot-(rootHere?1:0);
        const column=isRoot?0:Math.floor(slot/2)+(rootHere?1:0);
        const mid=40+rowHeight*(fieldIndex+.5);
        const x=155+column*235,y=isRoot?mid:mid+(slot%2===0?-1:1)*Math.min(34,rowHeight*.29);
        button.style.left=x+'px';button.style.top=y+'px';
        positions.push({button,x:start+x,y,mid,isRoot,field});
      });
    });
    start+=parseFloat(group.style.width);
  });
  model.config.fields.forEach(field=>{
    const leaves=positions.filter(p=>p.field.id===field.id),root=leaves.find(p=>p.isRoot);
    if(!root)return;
    const spine=`M ${root.x+96} ${root.mid} C ${root.x+145} ${root.mid-6}, ${root.x+195} ${root.mid+6}, ${root.x+240} ${root.mid} L ${total-32} ${root.mid}`;
    el('path',{d:spine,class:'time-spine-glow',stroke:field.color,'data-tree-field':field.id},branches);
    el('path',{d:spine,class:'time-spine',stroke:field.color,'data-tree-field':field.id},branches);
    leaves.filter(p=>!p.isRoot).forEach(p=>{
      const endX=p.x-96,endY=p.y,forkX=Math.max(root.x+96,endX-100);
      const d=`M ${forkX} ${p.mid} C ${forkX+35} ${p.mid}, ${endX-42} ${endY}, ${endX} ${endY}`;
      const path=el('path',{d,class:'time-branch',stroke:field.color},branches);path.dataset.entryId=p.button.dataset.entryId;
      el('circle',{cx:endX,cy:endY,r:2.2,fill:field.color,class:'time-terminal'},branches);
    });
  });
  $('timeline-earlier').disabled=stage.scrollLeft<2;
  $('timeline-later').disabled=stage.scrollLeft+stage.clientWidth>=stage.scrollWidth-2;
}

function selectTimelineEntry(node){
  model.selected=node;
  document.querySelectorAll('.timeline-entry').forEach(b=>b.classList.toggle('selected',b.dataset.entryId===node.id));
  EntryInspector.open(node,{onClose:clearSelection,onSelect:id=>{const next=model.nodes.find(n=>n.id===id);if(next)select(next);},memberships:model.config.memberships,topics:model.config.topics,entries:model.entries});
  const card=[...document.querySelectorAll('.timeline-entry')].find(b=>b.dataset.entryId===node.id);
  if(card)requestAnimationFrame(()=>card.scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'nearest',inline:'center'}));
  $('map-status').textContent=node.title+', studied '+formatStudyMonth(studiedMonth(model.details[node.id]));
}
function setView(view,restoreSelection=true){
  if(view===model.view)return;
  const selected=model.selected;
  if(model.view==='ontology')model.savedOntologySelection=selected?.id;
  model.view=view;const timeline=view==='timeline';
  if(timeline)$('map').setAttribute('hidden','');else $('map').removeAttribute('hidden');$('intro').hidden=timeline;
  document.querySelector('.map-footer').hidden=timeline;document.querySelector('.depth-controls').hidden=timeline;
  $('timeline-view').hidden=!timeline;
  $('view-ontology').setAttribute('aria-pressed',String(!timeline));$('view-timeline').setAttribute('aria-pressed',String(timeline));
  document.querySelector('.atlas').classList.toggle('timeline-active',timeline);
  if(timeline){
    requestAnimationFrame(layoutTimeline);
    if(selected?.kind==='entry')selectTimelineEntry(selected);else clearSelection();
    $('map-status').textContent='Timeline aligned by your dates of study';
  }else if(restoreSelection){
    const next=selected?.kind==='entry'?selected:model.nodes.find(n=>n.id===model.savedOntologySelection);
    if(next)select(next);else home();
  }
  wake();
}

Promise.all([fetch('map-config.json').then(r=>r.ok?r:fetch('examples/map-config.json')).then(r=>{if(!r.ok)throw Error('config');return r.json();}),fetch('entries.json').then(r=>r.ok?r:fetch('examples/entries.json')).then(r=>{if(!r.ok)throw Error('entries');return r.json();}),fetch('entry-details.json').then(r=>r.ok?r:fetch('examples/entry-details.json')).then(r=>{if(!r.ok)throw Error('details');return r.json();})]).then(([config,entries,details])=>build(config,entries,details.entries)).catch(e=>{console.error(e);$('load-error').hidden=false;});

// Accessible browser checks can inspect the same graph used on screen.
window.atlas={model,camera,target,home,zoom,select,get fitScale(){return fitScale;}};

// Paper is the default; the previous appearance remains available as dark mode.
function updateThemeControl(){
  const dark=document.documentElement.dataset.theme==='dark';
  const button=$('theme-toggle');button.textContent=dark?'☀':'☾';
  button.setAttribute('aria-label',dark?'Switch to warm paper mode':'Switch to dark mode');
  button.title=button.getAttribute('aria-label');button.setAttribute('aria-pressed',String(dark));
}
$('theme-toggle').addEventListener('click',()=>{
  const theme=document.documentElement.dataset.theme==='dark'?'paper':'dark';
  document.documentElement.dataset.theme=theme;
  try{localStorage.setItem('research-map-theme',theme);}catch{}
  updateThemeControl();
});
updateThemeControl();
