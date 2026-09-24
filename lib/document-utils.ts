/**
 * Utility functions for handling document attachments (PDF, Images, etc.)
 * Resolves browser data: URI navigation blocks, provides safe viewing,
 * client-side compression to <= 200 KB, and reliable downloading.
 */

export function isPdf(url?: string | null, filename?: string | null): boolean {
  if (!url && !filename) return false;
  if (url && (url.startsWith('data:application/pdf') || url.toLowerCase().includes('.pdf'))) {
    return true;
  }
  if (filename && filename.toLowerCase().endsWith('.pdf')) {
    return true;
  }
  return false;
}

export function isImage(url?: string | null, filename?: string | null): boolean {
  if (!url && !filename) return false;
  if (url && (url.startsWith('data:image/') || /\.(jpg|jpeg|png|webp|gif|bmp)(\?|$)/i.test(url))) {
    return true;
  }
  if (filename && /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(filename)) {
    return true;
  }
  return false;
}

/**
 * Converts a base64 Data URI into a standard Blob object with correct MIME type
 */
export function dataURItoBlob(dataURI: string): Blob | null {
  try {
    if (!dataURI || !dataURI.startsWith('data:')) return null;
    const parts = dataURI.split(',');
    if (parts.length < 2) return null;

    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const byteString = atob(parts[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);

    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }

    return new Blob([ia], { type: mime });
  } catch (err) {
    console.error('Error converting dataURI to Blob:', err);
    return null;
  }
}

/**
 * Creates a safe object URL (blob:...) that modern browsers can view and open
 * without triggering "Not allowed to navigate top frame to data URL" (which causes blank pages).
 */
export function getSafeBlobUrl(dataUriOrUrl: string): { blobUrl: string; revoke: () => void } {
  if (!dataUriOrUrl) {
    return { blobUrl: '', revoke: () => {} };
  }

  if (dataUriOrUrl.startsWith('data:')) {
    const blob = dataURItoBlob(dataUriOrUrl);
    if (blob && typeof window !== 'undefined' && window.URL) {
      const blobUrl = URL.createObjectURL(blob);
      return {
        blobUrl,
        revoke: () => URL.revokeObjectURL(blobUrl)
      };
    }
  }

  // Already a standard HTTP/HTTPS/blob URL
  return {
    blobUrl: dataUriOrUrl,
    revoke: () => {}
  };
}

/**
 * Safely opens a document in a new tab without "about:blank" blank-page security blocks
 */
export function openDocumentInNewTab(urlOrDataUri: string, filename?: string): void {
  if (!urlOrDataUri) return;

  if (urlOrDataUri.startsWith('data:')) {
    const blob = dataURItoBlob(urlOrDataUri);
    if (blob) {
      const blobUrl = URL.createObjectURL(blob);
      const newWin = window.open(blobUrl, '_blank');
      if (!newWin) {
        // Fallback to download if popup blocked
        downloadDocument(urlOrDataUri, filename || 'Dokumen_Lampiran');
      }
      // Release blob URL after a reasonable viewing delay
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      return;
    }
  }

  window.open(urlOrDataUri, '_blank');
}

/**
 * Downloads a document directly with the intended file name
 */
export function downloadDocument(urlOrDataUri: string, filename: string): void {
  if (!urlOrDataUri) return;

  let targetUrl = urlOrDataUri;
  let needsRevoke = false;

  if (urlOrDataUri.startsWith('data:')) {
    const blob = dataURItoBlob(urlOrDataUri);
    if (blob) {
      targetUrl = URL.createObjectURL(blob);
      needsRevoke = true;
    }
  }

  const link = document.createElement('a');
  link.href = targetUrl;
  link.download = filename || 'Dokumen_Lampiran';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (needsRevoke) {
    setTimeout(() => URL.revokeObjectURL(targetUrl), 10000);
  }
}

/**
 * Process, validate, and compress attachment file up to maximum 200 KB.
 * Handles PDF (size validation <= 200 KB) and images (auto-compress with canvas if > 200 KB).
 */
export async function validateAndCompressAttachment(
  file: File,
  maxKB = 200
): Promise<{
  dataUrl: string;
  filename: string;
  sizeKB: number;
  originalSizeKB: number;
  wasCompressed: boolean;
  mimeType: string;
}> {
  const originalSizeKB = Math.round(file.size / 1024);
  const maxBytes = maxKB * 1024;

  const isFilePdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isFileImage =
    file.type.startsWith('image/') ||
    /\.(jpg|jpeg|png|webp|bmp)$/i.test(file.name);

  if (!isFilePdf && !isFileImage) {
    throw new Error('Format file tidak didukung. Mohon unggah berkas Gambar (JPG, PNG, WebP) atau PDF.');
  }

  // 1. Handling PDF
  if (isFilePdf) {
    if (file.size > maxBytes) {
      throw new Error(
        `Ukuran file PDF (${originalSizeKB} KB) melebihi batas maksimal ${maxKB} KB. Bukti dukung izin biasanya hanya 1-2 lembar berkas scan/foto.`
      );
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          dataUrl: reader.result as string,
          filename: file.name,
          sizeKB: originalSizeKB,
          originalSizeKB,
          wasCompressed: false,
          mimeType: 'application/pdf'
        });
      };
      reader.onerror = () => reject(new Error('Gagal membaca file PDF.'));
      reader.readAsDataURL(file);
    });
  }

  // 2. Handling Image with auto-compression if > 200 KB
  if (file.size <= maxBytes) {
    // Already within limit
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          dataUrl: reader.result as string,
          filename: file.name,
          sizeKB: originalSizeKB,
          originalSizeKB,
          wasCompressed: false,
          mimeType: file.type || 'image/jpeg'
        });
      };
      reader.onerror = () => reject(new Error('Gagal membaca gambar.'));
      reader.readAsDataURL(file);
    });
  }

  // Image exceeds 200 KB: compress automatically using Canvas
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let { width, height } = img;

          // Scale down dimensions if very large (e.g. 4K camera photos)
          const MAX_DIMENSION = 1400;
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            if (width > height) {
              height = Math.round((height * MAX_DIMENSION) / width);
              width = MAX_DIMENSION;
            } else {
              width = Math.round((width * MAX_DIMENSION) / height);
              height = MAX_DIMENSION;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Gagal inisialisasi pengolah gambar.');
          }

          // Fill white background for transparent images converted to JPEG
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          // Try progressive quality reductions until <= maxBytes
          let quality = 0.82;
          let compressedDataUrl = canvas.toDataURL('image/jpeg', quality);

          while (compressedDataUrl.length * 0.75 > maxBytes && quality > 0.3) {
            quality -= 0.12;
            compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          }

          // If still over 200 KB, reduce dimensions further
          if (compressedDataUrl.length * 0.75 > maxBytes) {
            canvas.width = Math.round(width * 0.75);
            canvas.height = Math.round(height * 0.75);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            compressedDataUrl = canvas.toDataURL('image/jpeg', 0.65);
          }

          const approxSizeKB = Math.round((compressedDataUrl.length * 0.75) / 1024);

          if (approxSizeKB > maxKB) {
            throw new Error(
              `Ukuran foto (${originalSizeKB} KB) terlalu besar dan setelah dikompresi masih ${approxSizeKB} KB (maksimal ${maxKB} KB). Mohon perkecil foto atau potong bagian yang diperlukan saja.`
            );
          }

          // Rename filename extension to .jpg if needed
          let safeFilename = file.name;
          if (!safeFilename.toLowerCase().endsWith('.jpg') && !safeFilename.toLowerCase().endsWith('.jpeg')) {
            safeFilename = safeFilename.replace(/\.[^/.]+$/, '') + '.jpg';
          }

          resolve({
            dataUrl: compressedDataUrl,
            filename: safeFilename,
            sizeKB: approxSizeKB,
            originalSizeKB,
            wasCompressed: true,
            mimeType: 'image/jpeg'
          });
        } catch (compErr: any) {
          reject(compErr || new Error('Gagal mengompresi gambar.'));
        }
      };
      img.onerror = () => reject(new Error('Gagal memuat gambar untuk dikompresi.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
    reader.readAsDataURL(file);
  });
}
