function formatTranscript(segments) {
  const text = segments.map(segment => String(segment.text || '')).join('').trim();
  const sentences = text.match(/[^。！？!?]+[。！？!?]*|[。！？!?]+/g) || [];
  const paragraphs = []; let paragraph = '';
  for (const sentence of sentences) {
    paragraph += sentence;
    if (paragraph.length >= 180 && /[。！？!?]$/.test(paragraph)) {
      paragraphs.push(paragraph); paragraph = '';
    }
  }
  if (paragraph) paragraphs.push(paragraph);
  return paragraphs.join('\n\n');
}
module.exports = {formatTranscript};
