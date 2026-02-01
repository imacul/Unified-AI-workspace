// Generic Playwright script to fetch the main textual content of a URL from the prompt
// Prompt should be a URL unless opts.url is provided

module.exports.run = async function({ page, prompt, model, opts }){
  const url = (opts && opts.url) || String(prompt || '').trim();
  if(!url || !url.startsWith('http')) return 'Invalid URL provided';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Extract main content heuristically
  const text = await page.$$eval('p,article,main', els => els.map(e => e.textContent.trim()).filter(Boolean).slice(0,10).join('\n\n'));
  if(text) return `Page extract:\n\n${text.slice(0,1000)}`;
  return 'No textual content found on page';
};
