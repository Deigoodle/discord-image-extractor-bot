import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createLogger } from '@/services/logger';
import axios from 'axios';
import { getAlbumId, setAlbumId, loadAlbumCache } from '@/state/albumCache';

const logger = createLogger('googlePhotosService');
const SCOPES = [
  'https://www.googleapis.com/auth/photoslibrary.appendonly'
];
const TOKEN_PATH = './data/google-token.json';
const CREDENTIALS_PATH = process.env.GOOGLE_OAUTH_CREDENTIALS_PATH || './oauth-credentials.json';

class GooglePhotosService {
  private auth: any = null;

  async initialize() {
    try {
      // Load album cache from disk
      loadAlbumCache();
      
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
        logger.info('Google Photos initialized with saved token');
      } else {
        // Need to authorize first time
        await this.getNewToken(oAuth2Client);
      }

      this.auth = oAuth2Client;
    } catch (error) {
      logger.error('Error initializing Google Photos', error);
      throw error;
    }
  }

  private async getNewToken(oAuth2Client: any) {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📋 FIRST TIME SETUP - Google Photos Authorization Required');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n1. Open this URL in your browser:');
    console.log('\n' + authUrl + '\n');
    console.log('2. Login with your Google account');
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

  async findOrCreateAlbum(albumTitle: string): Promise<string> {
    if (!this.auth) {
      throw new Error('Photos client not initialized');
    }

    // Check persistent cache first
    const cachedAlbumId = getAlbumId(albumTitle);
    if (cachedAlbumId) {
      logger.debug(`Using cached album ID for: ${albumTitle}`);
      return cachedAlbumId;
    }

    try {
      const accessToken = await this.auth.getAccessToken();
      
      // Create new album with the channel name
      // Note: Google Photos API (as of March 2025) doesn't allow listing albums
      // so we always create. If an album with this name exists, we'll get a new one.
      logger.info(`Creating album: ${albumTitle}`);
      const createResponse = await axios.post(
        'https://photoslibrary.googleapis.com/v1/albums',
        {
          album: { title: albumTitle }
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const albumId = createResponse.data.id;
      logger.info(`Created album "${albumTitle}" with ID: ${albumId}`);
      
      // Save to persistent cache
      setAlbumId(albumTitle, albumId);
      
      return albumId;
    } catch (error: any) {
      logger.error('Error creating album');
      if (error.response) {
        logger.error(`Status: ${error.response.status}`);
        logger.error(`Status Text: ${error.response.statusText}`);
        logger.error(`Error Data: ${JSON.stringify(error.response.data)}`);
      } else {
        logger.error(`Error message: ${error.message || JSON.stringify(error)}`);
      }
      throw error;
    }
  }

  async uploadImage(
    imageBuffer: Buffer,
    fileName: string,
    albumId: string,
    mimeType: string = 'image/jpeg'
  ): Promise<string> {
    if (!this.auth) {
      throw new Error('Photos client not initialized');
    }

    try {
      const accessToken = await this.auth.getAccessToken();

      // Step 1: Upload the bytes to get an upload token
      const uploadResponse = await axios.post(
        'https://photoslibrary.googleapis.com/v1/uploads',
        imageBuffer,
        {
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/octet-stream',
            'X-Goog-Upload-Content-Type': mimeType,
            'X-Goog-Upload-Protocol': 'raw'
          }
        }
      );

      const uploadToken = uploadResponse.data;

      // Step 2: Create media item from upload token
      const createResponse = await axios.post(
        'https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate',
        {
          albumId: albumId,
          newMediaItems: [
            {
              description: fileName,
              simpleMediaItem: {
                fileName: fileName,
                uploadToken: uploadToken
              }
            }
          ]
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const mediaItem = createResponse.data.newMediaItemResults?.[0]?.mediaItem;
      
      if (!mediaItem?.productUrl) {
        throw new Error('Failed to get product URL from upload response');
      }

      logger.info(`Successfully uploaded: ${fileName}`);
      return mediaItem.productUrl;
    } catch (error: any) {
      logger.error('Error uploading image to Google Photos');
      if (error.response) {
        logger.error('Google API Response:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: JSON.stringify(error.response.data, null, 2),
          headers: error.response.headers
        });
      } else {
        logger.error('Error details:', error);
      }
      throw error;
    }
  }

  async getAlbumShareLink(albumId: string): Promise<string | null> {
    if (!this.auth) {
      throw new Error('Photos client not initialized');
    }

    try {
      const accessToken = await this.auth.getAccessToken();

      // Share the album
      await axios.post(
        `https://photoslibrary.googleapis.com/v1/albums/${albumId}:share`,
        {
          sharedAlbumOptions: {
            isCollaborative: false,
            isCommentable: false
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Get the album details with share info
      const response = await axios.get(
        `https://photoslibrary.googleapis.com/v1/albums/${albumId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.shareInfo?.shareableUrl || null;
    } catch (error: any) {
      logger.error('Error getting album share link');
      if (error.response) {
        logger.error('Google API Response:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: JSON.stringify(error.response.data, null, 2)
        });
      } else {
        logger.error('Error details:', error);
      }
      return null;
    }
  }

  // Test function to verify API access
  async testConnection(): Promise<boolean> {
    if (!this.auth) {
      logger.error('Auth not initialized');
      return false;
    }

    try {
      const accessToken = await this.auth.getAccessToken();
      logger.info('Testing Google Photos API connection...');
      logger.info(`Access token: ${accessToken.token?.substring(0, 20)}...`);
      
      // Test by creating a test album (appendonly scope allows this)
      const testAlbumTitle = `API Test ${Date.now()}`;
      const response = await axios.post(
        'https://photoslibrary.googleapis.com/v1/albums',
        {
          album: { title: testAlbumTitle }
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('✅ Google Photos API connection successful!');
      logger.info(`Created test album "${testAlbumTitle}" with ID: ${response.data.id}`);
      return true;
    } catch (error: any) {
      logger.error('❌ Google Photos API connection FAILED');
      if (error.response) {
        logger.error(`Status: ${error.response.status}`);
        logger.error(`Status Text: ${error.response.statusText}`);
        logger.error(`Error Data: ${JSON.stringify(error.response.data)}`);
        logger.error(`Headers: ${JSON.stringify(error.response.headers)}`);
      } else if (error.message) {
        logger.error(`Error message: ${error.message}`);
      } else {
        logger.error(`Unknown error: ${JSON.stringify(error)}`);
      }
      return false;
    }
  }
}

export const googlePhotosService = new GooglePhotosService();