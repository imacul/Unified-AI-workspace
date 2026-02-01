function toMarkdown(sessionId, messages){
  const lines = [];
  lines.push(`# Conversation: ${sessionId}`);
  lines.push('');
  for(const m of messages){
    const time = new Date(m.timestamp || Date.now()).toISOString();
    lines.push(`**${m.role.toUpperCase()}** (${m.provider || ''} ${m.model || ''}) _${time}_`);
    lines.push('');
    lines.push(m.content || '');
    lines.push('');
  }
  return lines.join('\n');
}

function toHTML(sessionId, messages){
  const md = toMarkdown(sessionId, messages).replace(/\n/g,'<br/>');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${sessionId}</title><style>body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#0b1220}pre{white-space:pre-wrap}</style></head><body>${md}</body></html>`;
}

module.exports = { toMarkdown, toHTML };
