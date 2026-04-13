import * as fs from 'node:fs';
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

  private loadIndex(): CapabilityIndex {
    if (!fs.existsSync(this.indexPath)) {
      return { version: '1.0.0', capabilities: [] };
    }
    try {
      return JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
    } catch (err) {
      throw new Error(`Failed to parse registry index: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private saveIndex(index: CapabilityIndex): void {
    fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2));
  }

  search(query: string): CapabilityDefinition[] {
    const index = this.loadIndex();
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

  register(definition: Omit<CapabilityDefinition, 'tool_path' | 'created' | 'created_by' | 'version'>, code: string): void {
    this.validateName(definition.name);
    const index = this.loadIndex();

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

    this.saveIndex(index);

    if (!fs.existsSync(this.toolsPath)) {
      fs.mkdirSync(this.toolsPath, { recursive: true });
    }
    fs.writeFileSync(path.join(this.toolsPath, `${definition.name}.ts`), code);
  }

  load(name: string): string {
    this.validateName(name);
    const filePath = path.join(this.toolsPath, `${name}.ts`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Tool not found: ${name}`);
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  list(): CapabilityDefinition[] {
    return this.loadIndex().capabilities;
  }

  exists(name: string): boolean {
    return this.loadIndex().capabilities.some((c) => c.name === name);
  }
}
