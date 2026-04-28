export function formatSize(bytes: number, isDir: boolean): string {
  if (isDir) return '';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

export function formatDate(ms: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getParent(path: string): string | null {
  const p = path.replace(/[\\/]+$/, '');
  const sep = p.includes('\\') ? '\\' : '/';
  const idx = p.lastIndexOf(sep);
  if (idx <= 0) return null;
  const parent = p.slice(0, idx);
  // e.g. "C:" → "C:\"
  if (/^[A-Za-z]:$/.test(parent)) return parent + '\\';
  return parent || null;
}

export function breadcrumbParts(path: string): { label: string; path: string }[] {
  const normalized = path.replace(/\//g, '\\').replace(/\\+$/, '');
  const parts = normalized.split('\\').filter(Boolean);
  const result: { label: string; path: string }[] = [];
  let accumulated = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === 0 && /^[A-Za-z]:$/.test(part)) {
      accumulated = part + '\\';
    } else {
      accumulated = accumulated.endsWith('\\')
        ? accumulated + part
        : accumulated + '\\' + part;
    }
    result.push({ label: part || accumulated, path: accumulated });
  }
  return result;
}
