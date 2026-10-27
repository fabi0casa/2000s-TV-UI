/**
 * Parser de Listas M3U / M3U8
 * Extrai metadados completos de cada canal: tvg-id, tvg-name, tvg-logo, group-title, title e URL do stream.
 */

function parseM3U(content, defaultCountry = 'BR', sourceId = '') {
  if (!content || typeof content !== 'string') return [];

  const lines = content.split(/\r?\n/);
  const items = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      const tvgIdMatch = line.match(/tvg-id="([^"]*)"/i);
      const tvgNameMatch = line.match(/tvg-name="([^"]*)"/i);
      const tvgLogoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const groupTitleMatch = line.match(/group-title="([^"]*)"/i);
      const tvgCountryMatch = line.match(/tvg-country="([^"]*)"/i);

      // Título após a vírgula
      const commaIdx = line.lastIndexOf(',');
      let rawTitle = commaIdx !== -1 ? line.slice(commaIdx + 1).trim() : '';

      if (!rawTitle && tvgNameMatch) {
        rawTitle = tvgNameMatch[1];
      }

      current = {
        tvgId: tvgIdMatch ? tvgIdMatch[1].trim() : '',
        tvgName: tvgNameMatch ? tvgNameMatch[1].trim() : '',
        tvgLogo: tvgLogoMatch ? tvgLogoMatch[1].trim() : '',
        groupTitle: groupTitleMatch ? groupTitleMatch[1].trim() : '',
        rawTitle: rawTitle,
        country: (tvgCountryMatch ? tvgCountryMatch[1].toUpperCase() : defaultCountry) || defaultCountry,
        sourceId: sourceId,
        url: ''
      };
    } else if (!line.startsWith('#') && current) {
      if (line.startsWith('http://') || line.startsWith('https://')) {
        current.url = line;
        items.push(current);
        current = null;
      }
    }
  }

  return items;
}

module.exports = {
  parseM3U
};
