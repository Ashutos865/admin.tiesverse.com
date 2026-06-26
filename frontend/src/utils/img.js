// Resolve a possibly-relative image path to an absolute URL.
//
// Legacy content stores site-relative paths like "/work/x.webp" that physically
// live on the public website (tiesverse.com). Rendered inside the admin SPA
// those resolve against the admin origin and 404. New uploads store absolute
// Cloudinary URLs and pass through unchanged.
const PUBLIC_SITE = 'https://tiesverse.com';

export const resolveImg = (url) => {
  if (!url) return '';
  if (/^(https?:|data:|blob:)/i.test(url)) return url;       // already absolute
  return `${PUBLIC_SITE}${url.startsWith('/') ? '' : '/'}${url}`;
};
