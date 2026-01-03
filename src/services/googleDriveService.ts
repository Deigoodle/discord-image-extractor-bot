import { google } from 'googleapis';
import { readFileSync } from 'fs';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

class GoogleDriveService {
  private driveClient: any = null;

  async initialize() {
    try {
      const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || './google-credentials.json';
      const credentials = JSON.parse(readFileSync(credentialsPath, 'utf-8'));

      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: SCOPES,
      });

      this.driveClient = google.drive({ version: 'v3', auth });
      console.log('✅ Google Drive initialized');
    } catch (error) {
      console.error('❌ Error initializing Google Drive:', error);
      throw error;
    }
  }

  async findOrCreateFolder(folderName: string, parentId?: string): Promise<string> {
    if (!this.driveClient) {
      throw new Error('Drive client not initialized. Call initialize() first.');
    }

    // Search for existing folder
    const query = parentId
      ? `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
      : `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

    const response = await this.driveClient.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    // Return existing folder if found
    if (response.data.files && response.data.files.length > 0) {
      console.log(`📁 Found existing folder: ${folderName}`);
      return response.data.files[0].id!;
    }

    // Create folder if it doesn't exist
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId && { parents: [parentId] }),
    };

    const folder = await this.driveClient.files.create({
      requestBody: fileMetadata,
      fields: 'id',
    });

    console.log(`📁 Created new folder: ${folderName}`);
    return folder.data.id!;
  }

  async uploadImage(
    imageBuffer: Buffer,
    fileName: string,
    folderId: string,
    mimeType: string = 'image/jpeg'
  ): Promise<string> {
    if (!this.driveClient) {
      throw new Error('Drive client not initialized. Call initialize() first.');
    }

    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    };

    const media = {
      mimeType: mimeType,
      body: require('stream').Readable.from(imageBuffer),
    };

    const response = await this.driveClient.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
    });

    return response.data.webViewLink || response.data.id;
  }
}

// Export a singleton instance
export const googleDriveService = new GoogleDriveService();