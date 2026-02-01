// Playwright script: perform a DuckDuckGo search and return the top result snippet
// Export an async function `run({page, prompt, model, opts})` that returns a string

module.exports.run = async function({ page, prompt, model, opts }){
  const q = encodeURIComponent(prompt || '');
  const url = `https://duckduckgo.com/?q=${q}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Attempt to select the first organic result snippet
  try{
    await page.waitForSelector('.result__snippet, .result__body', { timeout: 5000 });
    const snippet = await page.$$eval('.result__snippet, .result__body', els => els.map(e => e.textContent.trim()).filter(Boolean)[0]);
    if(snippet) return `Search snippet: ${snippet}`;
  }catch(e){}

  // Fallback: take the text of the first result title/link
  try{
    const title = await page.$$eval('.result__a', els => els.map(e => e.textContent.trim()).filter(Boolean)[0]);
    if(title) return `Search title: ${title}`;
  }catch(e){}

  return 'No search results found';
};
