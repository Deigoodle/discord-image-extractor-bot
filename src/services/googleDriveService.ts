import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createLogger } from '@/services/logger';

const logger = createLogger('googleDriveService');
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const TOKEN_PATH = './data/google-token.json';
const CREDENTIALS_PATH = process.env.GOOGLE_OAUTH_CREDENTIALS_PATH || './oauth-credentials.json';

class GoogleDriveService {
  private driveClient: any = null;

  async initialize() {
    try {
      const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8'));
      const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

      const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );

      // Check if we have a saved token
      if (existsSync(TOKEN_PATH)) {
        const token = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
        oAuth2Client.setCredentials(token);
        logger.info('Google Drive initialized with saved token');
      } else {
        // Need to authorize first time
        await this.getNewToken(oAuth2Client);
      }

      this.driveClient = google.drive({ version: 'v3', auth: oAuth2Client });
    } catch (error) {
      logger.error('Error initializing Google Drive', error);
      throw error;
    }
  }

  private async getNewToken(oAuth2Client: any) {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📋 FIRST TIME SETUP - Google Drive Authorization Required');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n1. Open this URL in your browser:');
    console.log('\n' + authUrl + '\n');
    console.log('2. Login with your STORAGE Google account');
    console.log('3. Click "Allow" to grant permissions');
    console.log('4. Copy the authorization code from the URL or page');
    console.log('5. Add to .env file: GOOGLE_AUTH_CODE=your_code_here');
    console.log('6. Restart the bot');
    console.log('\n═══════════════════════════════════════════════════════════\n');

    const code = process.env.GOOGLE_AUTH_CODE;
    if (!code) {
      throw new Error('GOOGLE_AUTH_CODE not found in .env. Please follow the steps above.');
    }

    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    // Save token for future use
    writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    logger.info('Token saved successfully. You can now remove GOOGLE_AUTH_CODE from .env');
  }

  async findOrCreateFolder(folderName: string, parentId?: string): Promise<string> {
    if (!this.driveClient) {
      throw new Error('Drive client not initialized');
    }

    const query = parentId
      ? `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
      : `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

    const response = await this.driveClient.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (response.data.files && response.data.files.length > 0) {
      logger.debug(`Found existing folder: ${folderName}`);
      return response.data.files[0].id!;
    }

    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId && { parents: [parentId] }),
    };

    const folder = await this.driveClient.files.create({
      requestBody: fileMetadata,
      fields: 'id',
    });

    logger.info(`Created new folder: ${folderName}`);
    return folder.data.id!;
  }

  async uploadImage(
    imageBuffer: Buffer,
    fileName: string,
    folderId: string,
    mimeType: string = 'image/jpeg'
  ): Promise<string> {
    if (!this.driveClient) {
      throw new Error('Drive client not initialized');
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

export const googleDriveService = new GoogleDriveService();