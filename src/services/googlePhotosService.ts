import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createLogger } from '@/services/logger';
import axios from 'axios';
import { getAlbumId, setAlbumId, loadAlbumCache } from '@/state/albumCache';

const logger = createLogger('googlePhotosService');

const SCOPES = [
  'https://www.googleapis.com/auth/photoslibrary'
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
      const { client_secret, client_id, redirect_uris } =
        credentials.installed || credentials.web;

      const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );

      // Check if we have a saved token
      if (existsSync(TOKEN_PATH)) {
        const token = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));

        logger.info(`📄 Token file scopes: ${token.scope || 'not specified'}`);

        oAuth2Client.setCredentials(token);

        try {
          const accessToken = await oAuth2Client.getAccessToken();
          if (!accessToken.token) {
            throw new Error('No access token available');
          }

          // 🔍 VERIFY SCOPES FROM GOOGLE
          try {
            const tokenInfo = await axios.get(
              'https://www.googleapis.com/oauth2/v3/tokeninfo',
              { params: { access_token: accessToken.token } }
            );

            logger.info(`✅ Token scopes from Google: ${tokenInfo.data.scope}`);
          } catch {
            logger.warn('⚠️ Could not verify token scopes with Google');
          }

          logger.info('Google Photos initialized with saved token');
        } catch (error: any) {
          logger.error(
            'Token validation failed, need to re-authenticate:',
            error.message
          );
          await this.getNewToken(oAuth2Client);
        }
      } else {
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
      prompt: 'consent'
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📋 FIRST TIME SETUP - Google Photos Authorization Required');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n1. Open this URL in your browser:\n');
    console.log(authUrl + '\n');
    console.log('2. Login with your Google account');
    console.log('3. Click "Allow" to grant permissions');
    console.log('4. Copy the authorization code');
    console.log('5. Add to .env file: GOOGLE_AUTH_CODE=your_code_here');
    console.log('6. Restart the bot');
    console.log('═══════════════════════════════════════════════════════════\n');

    const code = process.env.GOOGLE_AUTH_CODE;
    if (!code) {
      throw new Error('GOOGLE_AUTH_CODE not found in .env.');
    }

    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    if (tokens.scope) {
      logger.info(`✅ New token scopes: ${tokens.scope}`);
    } else {
      logger.warn('⚠️ New token did not include scope info');
    }

    writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    logger.info('Token saved successfully. You can now remove GOOGLE_AUTH_CODE from .env');
  }

  // ================================
  // Everything below is unchanged
  // ================================

  async findOrCreateAlbum(albumTitle: string, forceFresh: boolean = false): Promise<string> {
    if (!this.auth) {
      throw new Error('Photos client not initialized');
    }

    const accessToken = await this.auth.getAccessToken();

    if (!forceFresh) {
      const cachedAlbumId = getAlbumId(albumTitle);
      if (cachedAlbumId) {
        logger.debug(`Using cached album ID for: ${albumTitle}`);
        return cachedAlbumId;
      }
    }

    try {
      logger.info(`Searching for existing album: ${albumTitle}`);
      const listResponse = await axios.get(
        'https://photoslibrary.googleapis.com/v1/albums',
        {
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json'
          },
          params: { pageSize: 50 }
        }
      );

      const albums = listResponse.data.albums || [];
      const existingAlbum = albums.find((album: any) => album.title === albumTitle);

      if (existingAlbum) {
        logger.info(`Found existing album "${albumTitle}" with ID: ${existingAlbum.id}`);
        setAlbumId(albumTitle, existingAlbum.id);
        return existingAlbum.id;
      }

      logger.info(`Album "${albumTitle}" not found, creating new album...`);
    } catch (error: any) {
      if (error.response?.status === 403) {
        logger.warn('Cannot search for albums due to insufficient permissions. Creating new album instead...');
      } else {
        logger.warn(`Error searching for album, will create new one: ${error.message}`);
      }
    }

    try {
      logger.info(`Creating album: ${albumTitle}`);
      const createResponse = await axios.post(
        'https://photoslibrary.googleapis.com/v1/albums',
        { album: { title: albumTitle } },
        {
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const albumId = createResponse.data.id;
      logger.info(`Created album "${albumTitle}" with ID: ${albumId}`);
      setAlbumId(albumTitle, albumId);
      return albumId;
    } catch (error: any) {
      logger.error('Error creating album', error.response?.data || error.message);
      throw error;
    }
  }

  async uploadImage(
    imageBuffer: Buffer,
    fileName: string,
    albumId: string | null,
    mimeType: string = 'image/jpeg'
  ): Promise<string> {
    if (!this.auth) {
      throw new Error('Photos client not initialized');
    }

    // Validate inputs
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('Empty buffer provided');
    }
    
    // Google Photos has a 200MB limit for photos and videos via API
    const MAX_SIZE = 200 * 1024 * 1024; // 200MB
    if (imageBuffer.length > MAX_SIZE) {
      throw new Error(`File too large: ${imageBuffer.length} bytes (max: ${MAX_SIZE})`);
    }

    try {
      logger.debug(`Starting upload - File: ${fileName}, MIME: ${mimeType}, Size: ${imageBuffer.length} bytes`);
      const accessToken = await this.auth.getAccessToken();

      // Step 1: Upload the bytes to get an upload token
      logger.debug('Step 1: Uploading bytes to get upload token...');
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
      logger.debug(`Upload token received: ${uploadToken.substring(0, 50)}...`);

      // Step 2: Create media item from upload token
      logger.debug('Step 2: Creating media item from upload token...');
      let createResponse;
      
      // If we have an album ID, try to use it; otherwise upload to library
      if (albumId && albumId.trim() !== '') {
        try {
          // Try to create with album ID first
          createResponse = await axios.post(
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
          logger.debug('Successfully uploaded to album');
        } catch (error: any) {
          // If adding to album fails, try uploading without album
          if (error.response?.status === 403 || error.response?.status === 404) {
            logger.warn(`Failed to add to album ${albumId}, uploading to library instead...`);
            albumId = null; // Clear album ID so we don't try to add later
          } else {
            throw error;
          }
        }
      }
      
      // Upload to library (either because no album ID or album upload failed)
      if (!albumId || albumId.trim() === '') {
        createResponse = await axios.post(
          'https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate',
          {
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
        logger.info('Uploaded to Google Photos library (no album)');
      }

      if (!createResponse) {
        throw new Error('No response from Google Photos API during upload.');
      }

      logger.debug('Create response received:', JSON.stringify(createResponse.data, null, 2));

      const mediaItem = createResponse.data?.newMediaItemResults?.[0]?.mediaItem;
      const result = createResponse.data?.newMediaItemResults?.[0];

      // Check if the upload failed (status message other than "Success" or "OK")
      if (result?.status?.message && result.status.message !== 'Success' && result.status.message !== 'OK') {
        logger.error(`Upload failed with status: ${result.status.message}`);
        throw new Error(`Google Photos API error: ${result.status.message}`);
      }
      
      if (!mediaItem?.productUrl) {
        logger.error('Full response:', JSON.stringify(createResponse.data, null, 2));
        throw new Error('Failed to get product URL from upload response');
      }

      logger.info(`Successfully uploaded: ${fileName}`);
      return mediaItem.productUrl;
    } catch (error: any) {
      logger.error(`ERROR uploading: ${fileName}`);
      logger.error(`File details: MIME=${mimeType}, Size=${imageBuffer.length} bytes, AlbumID=${albumId}`);
      if (error.response) {
        logger.error(`Response status: ${error.response.status} ${error.response.statusText}`);
        logger.error(`Response data:`, error.response.data);
        logger.error(`Response headers:`, error.response.headers);
        if (typeof error.response.data === 'string') {
          logger.error(`Raw response data: ${error.response.data}`);
        } else {
          logger.error(`JSON response data: ${JSON.stringify(error.response.data, null, 2)}`);
        }
      } else if (error.request) {
        logger.error('Request was made but no response received');
        logger.error('Request details:', error.request);
      } else {
        logger.error('Error details:', error.message);
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
      
      // Get user info to show which account is authenticated
      try {
        const userInfoResponse = await axios.get(
          'https://www.googleapis.com/oauth2/v2/userinfo',
          {
            headers: {
              'Authorization': `Bearer ${accessToken.token}`
            }
          }
        );
        logger.info(`✅ Authenticated as: ${userInfoResponse.data.email} (${userInfoResponse.data.name})`);
        logger.info(`   User ID: ${userInfoResponse.data.id}`);
      } catch (error) {
        logger.warn('Could not fetch user info');
      }
      
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