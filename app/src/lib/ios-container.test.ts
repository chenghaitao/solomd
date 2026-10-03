import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/path', () => ({ documentDir: async () => '' }));

import { reanchorStorage } from './ios-container';

class MemStorage {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const OLD = '11111111-2222-3333-4444-555555555555';
const NEW = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';
const root = (u: string) => `/private/var/mobile/Containers/Data/Application/${u}`;

describe('reanchorStorage', () => {
  it('moves folders, recents and tab-session keys onto the current container', () => {
    const s = new MemStorage();
    s.setItem('solomd.workspace.v1', JSON.stringify({
      currentFolder: `${root(OLD)}/Documents`,
      recentFolders: [`${root(OLD)}/Documents`, `${root(NEW)}/Documents`, '/private/var/mobile/Library/Mobile Documents/com~apple~CloudDocs/笔记'],
      recentFiles: [`${root(OLD)}/Documents/a.md`],
    }));
    s.setItem(`solomd.tabs.v1::${root(OLD)}/Documents`, JSON.stringify({ tabs: [{ filePath: `${root(OLD)}/Documents/a.md` }] }));
    s.setItem('other.key', root(OLD));

    expect(reanchorStorage(s as unknown as Storage, NEW)).toBe(2);
    const ws = JSON.parse(s.getItem('solomd.workspace.v1')!);
    expect(ws.currentFolder).toBe(`${root(NEW)}/Documents`);
    expect(ws.recentFolders[0]).toBe(`${root(NEW)}/Documents`);
    expect(ws.recentFolders[1]).toContain('com~apple~CloudDocs/笔记');
    expect(ws.recentFolders).toHaveLength(2);
    expect(ws.recentFiles[0]).toBe(`${root(NEW)}/Documents/a.md`);
    expect(s.getItem(`solomd.tabs.v1::${root(OLD)}/Documents`)).toBeNull();
    expect(s.getItem(`solomd.tabs.v1::${root(NEW)}/Documents`)).toContain(`${root(NEW)}/Documents/a.md`);
    expect(s.getItem('other.key')).toBe(root(OLD));
  });

  it('leaves current paths alone and keeps an existing current-container session', () => {
    const s = new MemStorage();
    s.setItem(`solomd.tabs.v1::${root(NEW)}/Documents`, 'current');
    s.setItem(`solomd.tabs.v1::${root(OLD)}/Documents`, 'stale');
    s.setItem('solomd.workspace.v1', JSON.stringify({ currentFolder: `${root(NEW)}/Documents` }));
    reanchorStorage(s as unknown as Storage, NEW);
    expect(s.getItem(`solomd.tabs.v1::${root(NEW)}/Documents`)).toBe('current');
    expect(s.getItem(`solomd.tabs.v1::${root(OLD)}/Documents`)).toBeNull();
  });
});
