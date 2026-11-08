import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseConfig, ValidationIssue, type UserConfig } from '@ebrain-lab/weaver-markdown';

/** `~/.weaver/config.yaml`, or under `WEAVER_HOME`. Never inside a repository (DEC-014). The `weaver` tool uses the same file. */
export function userConfigPath(): string {
  return path.join(process.env.WEAVER_HOME ?? path.join(os.homedir(), '.weaver'), 'config.yaml');
}

export type UserConfigResult =
  | { kind: 'none' }
  | { kind: 'invalid'; path: string; issues: ValidationIssue[] }
  | { kind: 'ok'; path: string; config: UserConfig; text: string };

/** Reads the personal configuration. A file that exists but cannot be read is reported, not skipped. */
export function readUserConfig(): Promise<UserConfigResult> {
  return readConfigFile(userConfigPath());
}

/** Reads a configuration file, the personal one or a root file: they have the same keys (DEC-018 item 1). */
export async function readConfigFile(file: string): Promise<UserConfigResult> {
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch {
    return { kind: 'none' };
  }
  if (text.trim() === '') return { kind: 'none' };
  const parsed = parseConfig(file, text);
  return parsed.config ? { kind: 'ok', path: file, config: parsed.config, text } : { kind: 'invalid', path: file, issues: parsed.issues };
}

/** Writes the personal configuration. An existing file is kept next to it as `config.yaml.bak`. */
export function writeUserConfig(text: string, previousText?: string): Promise<string> {
  return writeConfigFile(userConfigPath(), text, previousText);
}

/** Writes a configuration file, creating its folder. An existing file is kept next to it as `config.yaml.bak`. */
export async function writeConfigFile(file: string, text: string, previousText?: string): Promise<string> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (previousText?.trim()) await fs.writeFile(`${file}.bak`, previousText, 'utf8');
  await fs.writeFile(file, text, 'utf8');
  return file;
}
