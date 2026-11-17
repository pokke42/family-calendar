// Home Assistant Supervisor's Ingress proxy is the only trusted upstream.
export function ingressBase(req, enabled) {
  if (!enabled || !['172.30.32.2', '::ffff:172.30.32.2'].includes(req.socket.remoteAddress)) return null;
  const path = req.headers['x-ingress-path'];
  if (typeof path !== 'string' || !/^\/api\/hassio_ingress\/[a-zA-Z0-9_-]+\/?$/.test(path)) return null;
  if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return null;
  return path.replace(/\/$/, '') + '/';
}
