// Mirrors storage.rules. Metadata must come from the server's upload parser,
// never from an unverified browser claim. No file hosting is enabled by this module.
export function allowStorageOperation({ uid, path, action, contentType, size }) {
  if (typeof uid !== 'string' || !uid || typeof path !== 'string' || !['read','delete','create','update'].includes(action)) return false;
  const parts = path.split('/');
  if (parts.some(p => !p || p === '.' || p === '..') || parts[0] !== 'users' || parts[1] !== uid) return false;
  const image = (parts[2] === 'avatars' && parts.length === 4) || (parts[2] === 'flashcards' && parts.length === 5);
  const source = parts[2] === 'notebookSources' && parts.length === 4;
  if (!image && !source) return false;
  if (action === 'read' || action === 'delete') return true;
  return Number.isSafeInteger(size) && size >= 0 && size < (image ? 8 : 25) * 1024 * 1024 &&
    (!image || typeof contentType === 'string' && /^image\/.*$/.test(contentType));
}
