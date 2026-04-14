import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CapabilityDefinition, CapabilityIndex } from './types.js';

const VALID_TOOL_NAME = /^[a-z0-9_]+$/;

export class CapabilityRegistry {
  private indexPath: string;
  private toolsPath: string;

  constructor(workspacePath: string) {
    this.toolsPath = path.join(workspacePath, 'tools');
    this.indexPath = path.join(this.toolsPath, 'index.json');
  }

  private validateName(name: string): void {
    if (!VALID_TOOL_NAME.test(name)) {
      throw new Error(`Invalid tool name: '${name}'. Only lowercase letters, digits, and underscores allowed.`);
    }
  }

  private async loadIndex(): Promise<CapabilityIndex> {
    try {
      const raw = JSON.parse(await fs.readFile(this.indexPath, 'utf-8'));
      // Ensure capabilities array exists even if index.json is malformed
      if (!Array.isArray(raw?.capabilities)) {
        return { version: raw?.version ?? '1.0.0', capabilities: [] };
      }
      return raw as CapabilityIndex;
    } catch (err: unknown) {
      // File not found or corrupted — treat as empty rather than crashing
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { version: '1.0.0', capabilities: [] };
      }
      // Corrupted JSON — treat as empty
      return { version: '1.0.0', capabilities: [] };
    }
  }

  private async saveIndex(index: CapabilityIndex): Promise<void> {
    await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2));
  }

  async search(query: string): Promise<CapabilityDefinition[]> {
    const index = await this.loadIndex();
    const terms = query.toLowerCase().split(/\s+/);

    return index.capabilities
      .map((cap) => {
        const searchable = `${cap.name} ${cap.capability} ${cap.triggers.join(' ')}`.toLowerCase();
        const score = terms.filter((t) => searchable.includes(t)).length;
        return { cap, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ cap }) => cap);
  }

  async register(definition: Omit<CapabilityDefinition, 'tool_path' | 'created' | 'created_by' | 'version'>, code: string): Promise<void> {
    this.validateName(definition.name);
    const index = await this.loadIndex();

    const fullDef: CapabilityDefinition = {
      ...definition,
      tool_path: `${definition.name}.ts`,
      created: new Date().toISOString().split('T')[0],
      created_by: 'model',
      version: '1.0.0',
    };

    const existing = index.capabilities.findIndex((c) => c.name === definition.name);
    if (existing >= 0) {
      index.capabilities[existing] = fullDef;
    } else {
      index.capabilities.push(fullDef);
    }

    await this.saveIndex(index);

    try {
      await fs.access(this.toolsPath);
    } catch {
      await fs.mkdir(this.toolsPath, { recursive: true });
    }
    await fs.writeFile(path.join(this.toolsPath, `${definition.name}.ts`), code);
  }

  async load(name: string): Promise<string> {
    this.validateName(name);
    const filePath = path.join(this.toolsPath, `${name}.ts`);
    return fs.readFile(filePath, 'utf-8');
  }
}
