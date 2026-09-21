export type MarkdownStats = {
  characters: number;
  readingMinutes: number;
};

const cjkCharacter = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const latinWord = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export function getMarkdownStats(markdown: string): MarkdownStats {
  const readable = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^[#>*+\-\d.\s]+/gm, '')
    .replace(/[\*_~|]/g, ' ')
    .trim();

  const characters = Array.from(readable).filter((character) => !/\s/u.test(character)).length;
  if (characters === 0) return { characters: 0, readingMinutes: 0 };

  const cjkCount = readable.match(cjkCharacter)?.length ?? 0;
  const latinCount = readable.replace(cjkCharacter, ' ').match(latinWord)?.length ?? 0;
  const readingMinutes = Math.max(1, Math.ceil(cjkCount / 400 + latinCount / 220));
  return { characters, readingMinutes };
}
