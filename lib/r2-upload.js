/**
 * lib/r2-upload — upload files to Polsia R2 via the proxy API.
 * Uses node-fetch + form-data (not native fetch — native fetch breaks form-data streams).
 */
const fetch = require('node-fetch');
const FormData = require('form-data');

async function uploadToR2(buffer, filename, mimeType) {
  const formData = new FormData();
  formData.append('file', buffer, {
    filename,
    contentType: mimeType,
  });

  const response = await fetch('https://polsia.com/api/proxy/r2/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.POLSIA_API_KEY}`,
      ...formData.getHeaders(),
    },
    body: formData,
  });

  const result = await response.json();
  if (!result.success) {
    const err = result.error?.message || result.error || 'Upload failed';
    throw new Error(`[r2-upload] ${err}`);
  }
  return result.file.url;
}

module.exports = { uploadToR2 };