/* Metadata inspector; all content comes from the local ontology records. */
window.EntryInspector = (() => {
  const panel = document.getElementById('entry-sidebar');
  const content = document.getElementById('entry-content');
  const closeButton = document.getElementById('entry-close');
  let data = {}, current = null, context = null, loadFailed = false;
  const ready = fetch('entry-details.json').then(r => r.ok ? r : fetch('examples/entry-details.json')).then(r => {
    if (!r.ok) throw new Error('Entry details could not load');
    return r.json();
  }).then(d => { data = d.entries; if (current) render(); }).catch(() => {
    loadFailed = true; if (current) render();
  });

  function html(tag, className, text, parent) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function safeUrl(value) {
    try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; }
    catch { return null; }
  }
  function link(parent, text, value, className = '') {
    const url = safeUrl(value); if (!url) return;
    const a = html('a', className, text, parent);
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
  }
  function date(value) {
    if (!value) return null;
    const parts=new Intl.DateTimeFormat('en-US', { month:'long', year:'numeric', timeZone:'UTC' }).formatToParts(new Date(value + (value.length === 7 ? '-01' : '') + 'T12:00:00Z'));
    return parts.find(p=>p.type==='month').value+' / '+parts.find(p=>p.type==='year').value;
  }
  function section(label) {
    const s = html('section', 'inspector-section', null, content);
    html('h3', '', label, s); return s;
  }
  function row(parent, label, value) {
    if (value === null || value === undefined || value === '') return;
    const r = html('div', 'metadata-row', null, parent);
    html('dt', '', label, r); html('dd', '', String(value), r);
  }
  function unique(items) {
    const seen = new Set();
    return items.filter(i => { const key=i.text.trim().toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
  }
  function go(id) { context?.onSelect(id); }

  function render() {
    content.replaceChildren();
    const entry = data[current.id];
    const type = current.entryKind || current.kind;
    document.getElementById('entry-type').textContent = type === 'paper' ? 'Paper' : 'Study topic';
    document.getElementById('entry-title').textContent = entry?.title || current.title;
    panel.style.setProperty('--entry-color', current.color);
    if (!entry) {
      html('p', 'inspector-empty', loadFailed ? 'The details could not load. Refresh the preview to try again.' : 'Loading your discussion notes…', content);
      return;
    }

    if (entry.authors?.length) html('p', 'entry-authors', entry.authors[0] + (entry.authors.length > 1 ? ' et al.' : ''), content);
    if (entry.description) html('p', 'entry-description', entry.description, content);
    const meta = html('dl', 'entry-metadata', null, content);
    row(meta, 'Published Year', entry.publication_year);
    row(meta, 'Venue', entry.venue);
    row(meta, 'Institution', entry.institutions?.join(', '));
    const dates = entry.sessions.map(s => s.first_discussed_date).filter(Boolean).sort();
    row(meta, 'Studied Date', date(entry.studied_month || dates[0]));
    if (!meta.children.length) meta.remove();

    if (entry.urls?.paper || entry.urls?.code) {
      const actions = html('div', 'entry-actions', null, content);
      link(actions, 'Read paper ↗', entry.urls.paper, 'entry-primary-action');
      link(actions, 'Code ↗', entry.urls.code, 'entry-secondary-action');
    }

    const insights = entry.public_insights || [];
    if (insights.length) {
      const s = section('Insights');
      const list = html('ol', 'insight-list', null, s);
      insights.forEach(i => {
        const item = html('li', '', null, list);
        html('p', '', typeof i === 'string' ? i : i.text, item);
      });
    }
    const questions = entry.asked_questions || [];
    if (questions.length) {
      const s = section('Asked Questions');
      questions.forEach(q => {
        const disclosure = html('details', 'asked-question', null, s);
        html('summary', '', q.question, disclosure);
        html('p', 'question-answer', q.answer, disclosure);
      });
    }

    const membership = context.memberships.find(m => m.entry_id === entry.id);
    if (membership?.topic_ids.length) {
      const s=section('Topics'),chips=html('div','topic-chips',null,s);
      membership.topic_ids.forEach(id=>{
        const topic=context.topics.find(t=>t.id===id);if(!topic)return;
        const b=html('button','topic-chip',topic.title,chips);b.type='button';b.addEventListener('click',()=>go(id));
      });
    }
    const related=(entry.related_entry_ids || []).map(id=>context.entries.find(e=>e.id===id)).filter(Boolean);
    if(related.length){
      const s=section('Related entries');
      related.forEach(e=>{
        const b=html('button','related-entry',null,s);b.type='button';
        html('span','related-entry-kind',e.kind==='paper'?'PAPER':'STUDY',b);html('span','',e.title,b);html('span','related-arrow','↗',b);
        b.addEventListener('click',()=>go(e.id));
      });
    }
  }
  function open(node, options) {
    current=node; context=options;
    panel.hidden=false; panel.setAttribute('aria-hidden','false');
    render(); content.scrollTop=0;
    requestAnimationFrame(()=>panel.classList.add('is-open'));
    document.querySelector('.atlas').classList.add('inspector-open');
  }
  function close() {
    current=null;panel.classList.remove('is-open');panel.setAttribute('aria-hidden','true');
    document.querySelector('.atlas').classList.remove('inspector-open');
    setTimeout(()=>{if(!current)panel.hidden=true;},220);
  }
  closeButton.addEventListener('click',()=>context?.onClose());
  function mapCenter(width) { return current && width>=520 ? (width-panel.getBoundingClientRect().width-36)/2 : width/2; }
  return {open,close,mapCenter,ready};
})();
