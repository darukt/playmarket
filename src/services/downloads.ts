export interface DownloadRequest {
  kind: 'file' | 'store';
  platform: 'windows' | 'android';
}

/** Resolve official availability through our API, then let the browser stream. */
export async function requestDownload(id: string, signal: AbortSignal): Promise<DownloadRequest> {
  const preferred = /Windows/i.test(navigator.userAgent) ? 'windows' : 'android';
  const path = `/api/download/${encodeURIComponent(id)}`;
  const response = await fetch(`${path}?platform=${preferred}&resolve=1`, { credentials: 'same-origin', signal });
  if (!response.ok) throw new Error('Файл недоступен. Попробуйте загрузить его позже.');
  const result: unknown = await response.json();
  if (!result || typeof result !== 'object' || !('kind' in result) || !('platform' in result) ||
    (result.kind !== 'file' && result.kind !== 'store') || (result.platform !== 'android' && result.platform !== 'windows')) {
    throw new Error('Не удалось определить источник приложения.');
  }
  const download: DownloadRequest = { kind: result.kind, platform: result.platform };
  signal.throwIfAborted();
  const link = document.createElement('a');
  link.href = `${path}?platform=${download.platform}`;
  if (download.kind === 'file') link.download = '';
  else { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  document.body.appendChild(link);
  link.click();
  link.remove();
  return download;
}
