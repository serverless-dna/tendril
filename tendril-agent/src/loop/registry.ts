import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CapabilityDefinition, CapabilityIndex } from '../types.js';

const VALID_TOOL_NAME = /^[a-z0-9_]+$/;

/** Fields the model needs to decide which tool to use */
interface CapabilitySummary {
  name: string;
  capability: string;
  triggers: string[];
  suppression: string[];
}

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
      // Corrupted JSON — warn and treat as empty
      process.stderr.write(`[tendril-agent] Warning: corrupted index.json, treating as empty: ${err instanceof Error ? err.message : String(err)}\n`);
      return { version: '1.0.0', capabilities: [] };
    }
  }

  private async saveIndex(index: CapabilityIndex): Promise<void> {
    await fs.mkdir(this.toolsPath, { recursive: true });
    await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2));
  }

  /** Return all capabilities with only the fields needed for tool selection */
  async list(): Promise<CapabilitySummary[]> {
    const index = await this.loadIndex();
    return index.capabilities.map(({ name, capability, triggers, suppression }) => ({
      name,
      capability,
      triggers,
      suppression,
    }));
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

    await fs.writeFile(path.join(this.toolsPath, `${definition.name}.ts`), code);
  }

  async load(name: string): Promise<string> {
    this.validateName(name);
    const filePath = path.join(this.toolsPath, `${name}.ts`);
    return fs.readFile(filePath, 'utf-8');
  }
}
