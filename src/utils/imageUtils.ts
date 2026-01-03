import path from 'path';

export async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export function getFileNameFromUrl(url: string, messageId: string, index: number): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const extension = path.extname(pathname) || '.jpg';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    return `${messageId}_${index}_${timestamp}${extension}`;
  } catch {
    return `${messageId}_${index}_${Date.now()}.jpg`;
  }
}

export function getMimeTypeFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const extension = path.extname(urlObj.pathname).toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
    };
    
    return mimeTypes[extension] || 'image/jpeg';
  } catch {
    return 'image/jpeg';
  }
}