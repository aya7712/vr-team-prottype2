import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MemoryItem } from '../types/memory.js';
import { YamlCharacterParser } from './YamlCharacterParser.js';
import { MarkdownMemoryParser } from './MarkdownMemoryParser.js';
import type { CharacterDefRecord, SubCharacterRecord } from './types.js';

async function listYamlFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.yaml') && !entry.name.startsWith('_'))
    .map((entry) => join(dirPath, entry.name));
}

// memory/直下はすべて<owner>ディレクトリという前提（README.md/_template.mdは
// memory/直下の「ファイル」であり、ディレクトリではないため自然に除外される）。
async function listMemoryFiles(memoryDirPath: string): Promise<string[]> {
  const ownerEntries = await readdir(memoryDirPath, { withFileTypes: true });
  const ownerDirs = ownerEntries.filter((entry) => entry.isDirectory());

  const files: string[] = [];
  for (const ownerDir of ownerDirs) {
    const ownerPath = join(memoryDirPath, ownerDir.name);
    const memoEntries = await readdir(ownerPath, { withFileTypes: true });
    for (const entry of memoEntries) {
      if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
        files.push(join(ownerPath, entry.name));
      }
    }
  }
  return files;
}

/**
 * `character_def`リポジトリ（`CHARACTER_DEF_PATH`）から
 * design/main, design/sub, memory/**\/*.md を読み込む（`class-design.md` 12章、data-design.md 4章）。
 * 読み込み専用（fsのreaddir/readFileのみ使用）。`character_def`側のファイルは書き込まない。
 */
export class CharacterDefLoader {
  constructor(
    private readonly basePath: string,
    private readonly yamlParser: YamlCharacterParser = new YamlCharacterParser(),
    private readonly memoryParser: MarkdownMemoryParser = new MarkdownMemoryParser(),
  ) {}

  async loadAll(): Promise<{
    characters: CharacterDefRecord[];
    subCharacters: SubCharacterRecord[];
    memoryPresets: MemoryItem[];
  }> {
    const [characters, subCharacters, memoryPresets] = await Promise.all([
      this.loadCharacters(),
      this.loadSubCharacters(),
      this.loadMemoryPresets(),
    ]);

    return { characters, subCharacters, memoryPresets };
  }

  private async loadCharacters(): Promise<CharacterDefRecord[]> {
    const dirPath = join(this.basePath, 'design', 'main');
    const filePaths = await listYamlFiles(dirPath);
    return Promise.all(
      filePaths.map(async (filePath) => {
        const content = await readFile(filePath, 'utf-8');
        return this.yamlParser.parseMain(content, filePath);
      }),
    );
  }

  private async loadSubCharacters(): Promise<SubCharacterRecord[]> {
    const dirPath = join(this.basePath, 'design', 'sub');
    const filePaths = await listYamlFiles(dirPath);
    return Promise.all(
      filePaths.map(async (filePath) => {
        const content = await readFile(filePath, 'utf-8');
        return this.yamlParser.parseSub(content, filePath);
      }),
    );
  }

  private async loadMemoryPresets(): Promise<MemoryItem[]> {
    const dirPath = join(this.basePath, 'memory');
    const filePaths = await listMemoryFiles(dirPath);
    return Promise.all(
      filePaths.map(async (filePath) => {
        const content = await readFile(filePath, 'utf-8');
        return this.memoryParser.parse(content, filePath);
      }),
    );
  }
}
