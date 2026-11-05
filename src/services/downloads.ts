/** Let the browser stream to disk, without buffering entire installers in React memory. */
export async function requestDownload(id: string, signal: AbortSignal): Promise<void> {
  const platform = /Windows/i.test(navigator.userAgent) ? 'windows' : 'android';
  const url = `/api/download/${encodeURIComponent(id)}?platform=${platform}`;
  const response = await fetch(url, { method: 'HEAD', credentials: 'same-origin', signal });
  if (!response.ok) throw new Error('Файл недоступен. Попробуйте загрузить его позже.');
  if (signal.aborted) return;
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
