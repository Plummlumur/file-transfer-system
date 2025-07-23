const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { spawn } = require('child_process');
const { SystemSetting } = require('../models');
const logger = require('../utils/logger');

class FileService {
  constructor() {
    this.thumbnailSizes = {
      small: { width: 150, height: 150 },
      medium: { width: 300, height: 300 },
      large: { width: 600, height: 600 }
    };
  }

  /**
   * Generate SHA-256 checksum for a file
   */
  async generateChecksum(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const hashSum = crypto.createHash('sha256');
      hashSum.update(fileBuffer);
      return hashSum.digest('hex');
    } catch (error) {
      logger.error('Error generating checksum:', error);
      throw error;
    }
  }

  /**
   * Verify file integrity using checksum
   */
  async verifyChecksum(filePath, expectedChecksum) {
    try {
      const actualChecksum = await this.generateChecksum(filePath);
      return actualChecksum === expectedChecksum;
    } catch (error) {
      logger.error('Error verifying checksum:', error);
      return false;
    }
  }

  /**
   * Get file metadata (dimensions, duration, etc.)
   */
  async getFileMetadata(filePath, mimeType) {
    const metadata = {};

    try {
      const stats = await fs.stat(filePath);
      metadata.size = stats.size;
      metadata.created = stats.birthtime;
      metadata.modified = stats.mtime;

      // Get image metadata
      if (mimeType && mimeType.startsWith('image/')) {
        try {
          const imageMetadata = await sharp(filePath).metadata();
          metadata.width = imageMetadata.width;
          metadata.height = imageMetadata.height;
          metadata.format = imageMetadata.format;
          metadata.colorSpace = imageMetadata.space;
          metadata.hasAlpha = imageMetadata.hasAlpha;
        } catch (error) {
          logger.warn('Failed to get image metadata:', error);
        }
      }

      // Get video metadata (if ffprobe is available)
      if (mimeType && mimeType.startsWith('video/')) {
        try {
          const videoMetadata = await this.getVideoMetadata(filePath);
          Object.assign(metadata, videoMetadata);
        } catch (error) {
          logger.warn('Failed to get video metadata:', error);
        }
      }

    } catch (error) {
      logger.error('Error getting file metadata:', error);
    }

    return metadata;
  }

  /**
   * Get video metadata using ffprobe
   */
  async getVideoMetadata(filePath) {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ]);

      let output = '';
      let error = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        error += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe failed: ${error}`));
          return;
        }

        try {
          const data = JSON.parse(output);
          const videoStream = data.streams.find(s => s.codec_type === 'video');
          const audioStream = data.streams.find(s => s.codec_type === 'audio');

          const metadata = {
            duration: parseFloat(data.format.duration),
            bitrate: parseInt(data.format.bit_rate),
            format: data.format.format_name
          };

          if (videoStream) {
            metadata.width = videoStream.width;
            metadata.height = videoStream.height;
            metadata.fps = eval(videoStream.r_frame_rate); // e.g., "30/1" -> 30
            metadata.videoCodec = videoStream.codec_name;
          }

          if (audioStream) {
            metadata.audioCodec = audioStream.codec_name;
            metadata.sampleRate = parseInt(audioStream.sample_rate);
            metadata.channels = audioStream.channels;
          }

          resolve(metadata);
        } catch (parseError) {
          reject(parseError);
        }
      });

      ffprobe.on('error', reject);
    });
  }

  /**
   * Generate thumbnail for images and videos
   */
  async generateThumbnail(filePath, fileId, size = 'medium') {
    try {
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      const thumbnailDir = path.join(uploadDir, 'thumbnails');
      await fs.mkdir(thumbnailDir, { recursive: true });

      const thumbnailPath = path.join(thumbnailDir, `${fileId}_${size}.jpg`);
      const { width, height } = this.thumbnailSizes[size];

      // Detect file type
      const mimeType = await this.getMimeType(filePath);

      if (mimeType.startsWith('image/')) {
        await this.generateImageThumbnail(filePath, thumbnailPath, width, height);
      } else if (mimeType.startsWith('video/')) {
        await this.generateVideoThumbnail(filePath, thumbnailPath, width, height);
      } else {
        throw new Error('Unsupported file type for thumbnail generation');
      }

      const relativePath = path.relative(uploadDir, thumbnailPath);
      logger.info(`Thumbnail generated: ${relativePath}`);
      return relativePath;

    } catch (error) {
      logger.error('Thumbnail generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate thumbnail for images using Sharp
   */
  async generateImageThumbnail(inputPath, outputPath, width, height) {
    await sharp(inputPath)
      .resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({
        quality: 80,
        progressive: true
      })
      .toFile(outputPath);
  }

  /**
   * Generate thumbnail for videos using ffmpeg
   */
  async generateVideoThumbnail(inputPath, outputPath, width, height) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-ss', '00:00:01', // Seek to 1 second
        '-vframes', '1', // Extract 1 frame
        '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        '-y', // Overwrite output file
        outputPath
      ]);

      let error = '';

      ffmpeg.stderr.on('data', (data) => {
        error += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg failed: ${error}`));
        } else {
          resolve();
        }
      });

      ffmpeg.on('error', reject);
    });
  }

  /**
   * Get MIME type of a file
   */
  async getMimeType(filePath) {
    try {
      const { fileTypeFromFile } = await import('file-type');
      const fileType = await fileTypeFromFile(filePath);
      return fileType ? fileType.mime : 'application/octet-stream';
    } catch (error) {
      logger.warn('Failed to detect MIME type:', error);
      return 'application/octet-stream';
    }
  }

  /**
   * Validate file against security rules
   */
  async validateFile(filePath, originalName, mimeType) {
    const issues = [];

    try {
      // Check file size
      const stats = await fs.stat(filePath);
      const maxSize = await SystemSetting.getSetting('MAX_FILE_SIZE', 5368709120);
      
      if (stats.size > maxSize) {
        issues.push(`File size (${this.formatBytes(stats.size)}) exceeds maximum allowed size (${this.formatBytes(maxSize)})`);
      }

      // Check file extension
      const allowedExtensions = await SystemSetting.getSetting('ALLOWED_EXTENSIONS', []);
      const fileExtension = path.extname(originalName).toLowerCase().substring(1);
      
      if (allowedExtensions.length > 0 && !allowedExtensions.includes(fileExtension)) {
        issues.push(`File extension '.${fileExtension}' is not allowed`);
      }

      // Verify MIME type matches extension
      const detectedMimeType = await this.getMimeType(filePath);
      if (mimeType !== detectedMimeType) {
        issues.push(`MIME type mismatch: declared '${mimeType}', detected '${detectedMimeType}'`);
      }

      // Check for suspicious file patterns
      const suspiciousPatterns = [
        /\.exe$/i,
        /\.scr$/i,
        /\.bat$/i,
        /\.cmd$/i,
        /\.com$/i,
        /\.pif$/i,
        /\.vbs$/i,
        /\.js$/i,
        /\.jar$/i
      ];

      if (suspiciousPatterns.some(pattern => pattern.test(originalName))) {
        issues.push('File type is potentially dangerous');
      }

      // Check file content for suspicious patterns (basic scan)
      await this.scanFileContent(filePath, issues);

    } catch (error) {
      logger.error('File validation error:', error);
      issues.push('File validation failed');
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * Basic content scanning for suspicious patterns
   */
  async scanFileContent(filePath, issues) {
    try {
      // Read first 1KB of file for basic pattern matching
      const buffer = Buffer.alloc(1024);
      const fd = await fs.open(filePath, 'r');
      const { bytesRead } = await fd.read(buffer, 0, 1024, 0);
      await fd.close();

      const content = buffer.slice(0, bytesRead).toString('binary');

      // Check for executable signatures
      const executableSignatures = [
        'MZ', // PE executable
        '\x7fELF', // ELF executable
        '\xca\xfe\xba\xbe', // Java class file
        'PK\x03\x04', // ZIP (could contain executables)
      ];

      for (const signature of executableSignatures) {
        if (content.startsWith(signature)) {
          issues.push('File contains executable code signature');
          break;
        }
      }

      // Check for script patterns
      const scriptPatterns = [
        /<script/i,
        /javascript:/i,
        /vbscript:/i,
        /on\w+\s*=/i // Event handlers like onclick=
      ];

      if (scriptPatterns.some(pattern => pattern.test(content))) {
        issues.push('File contains potentially malicious script content');
      }

    } catch (error) {
      logger.warn('Content scanning failed:', error);
    }
  }

  /**
   * Clean up expired files
   */
  async cleanupExpiredFiles() {
    try {
      const { File } = require('../models');
      const uploadDir = process.env.UPLOAD_DIR || './uploads';

      // Find expired files
      const expiredFiles = await File.findAll({
        where: {
          expiry_date: {
            [require('sequelize').Op.lt]: new Date()
          },
          status: {
            [require('sequelize').Op.ne]: 'deleted'
          }
        }
      });

      let deletedCount = 0;
      let errorCount = 0;

      for (const file of expiredFiles) {
        try {
          // Delete physical file
          const filePath = path.join(uploadDir, file.file_path);
          await fs.unlink(filePath).catch(() => {}); // Ignore if file doesn't exist

          // Delete thumbnail
          if (file.thumbnail_path) {
            const thumbnailPath = path.join(uploadDir, file.thumbnail_path);
            await fs.unlink(thumbnailPath).catch(() => {});
          }

          // Mark as deleted in database
          await file.markAsDeleted();
          deletedCount++;

          logger.debug(`Deleted expired file: ${file.original_filename}`);

        } catch (error) {
          logger.error(`Failed to delete expired file ${file.id}:`, error);
          errorCount++;
        }
      }

      logger.info(`Cleanup completed: ${deletedCount} files deleted, ${errorCount} errors`);
      return { deletedCount, errorCount };

    } catch (error) {
      logger.error('Cleanup job failed:', error);
      throw error;
    }
  }

  /**
   * Get storage usage statistics
   */
  async getStorageStats() {
    try {
      const { File } = require('../models');
      const uploadDir = process.env.UPLOAD_DIR || './uploads';

      // Get database statistics
      const stats = await File.findAll({
        attributes: [
          [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'total_files'],
          [require('sequelize').fn('SUM', require('sequelize').col('file_size')), 'total_size'],
          [require('sequelize').fn('COUNT', require('sequelize').literal("CASE WHEN status = 'ready' THEN 1 END")), 'active_files'],
          [require('sequelize').fn('SUM', require('sequelize').literal("CASE WHEN status = 'ready' THEN file_size ELSE 0 END")), 'active_size']
        ],
        raw: true
      });

      // Get disk usage
      const diskUsage = await this.getDiskUsage(uploadDir);

      return {
        database: {
          totalFiles: parseInt(stats[0].total_files) || 0,
          totalSize: parseInt(stats[0].total_size) || 0,
          activeFiles: parseInt(stats[0].active_files) || 0,
          activeSize: parseInt(stats[0].active_size) || 0
        },
        disk: diskUsage,
        formatted: {
          totalSize: this.formatBytes(parseInt(stats[0].total_size) || 0),
          activeSize: this.formatBytes(parseInt(stats[0].active_size) || 0),
          diskUsed: this.formatBytes(diskUsage.used),
          diskFree: this.formatBytes(diskUsage.free),
          diskTotal: this.formatBytes(diskUsage.total)
        }
      };

    } catch (error) {
      logger.error('Failed to get storage stats:', error);
      throw error;
    }
  }

  /**
   * Get disk usage for a directory
   */
  async getDiskUsage(dirPath) {
    try {
      const stats = await fs.stat(dirPath);
      
      // This is a simplified version - in production you might want to use a library
      // like 'check-disk-space' for more accurate disk usage information
      return {
        used: 0, // Would need platform-specific implementation
        free: 0, // Would need platform-specific implementation
        total: 0 // Would need platform-specific implementation
      };
    } catch (error) {
      logger.error('Failed to get disk usage:', error);
      return { used: 0, free: 0, total: 0 };
    }
  }

  /**
   * Format bytes to human readable format
   */
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Create secure download stream
   */
  async createDownloadStream(filePath, range = null) {
    try {
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;

      if (range) {
        // Handle range requests for partial content
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;

        const stream = require('fs').createReadStream(filePath, { start, end });
        
        return {
          stream,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'application/octet-stream'
          },
          statusCode: 206
        };
      } else {
        // Full file download
        const stream = require('fs').createReadStream(filePath);
        
        return {
          stream,
          headers: {
            'Content-Length': fileSize,
            'Content-Type': 'application/octet-stream',
            'Accept-Ranges': 'bytes'
          },
          statusCode: 200
        };
      }
    } catch (error) {
      logger.error('Failed to create download stream:', error);
      throw error;
    }
  }

  /**
   * Archive multiple files into a ZIP
   */
  async createArchive(files, archiveName) {
    const archiver = require('archiver');
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const tempDir = path.join(uploadDir, 'temp');
    await fs.mkdir(tempDir, { recursive: true });

    const archivePath = path.join(tempDir, archiveName);
    const output = require('fs').createWriteStream(archivePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        logger.info(`Archive created: ${archivePath} (${archive.pointer()} bytes)`);
        resolve(archivePath);
      });

      archive.on('error', reject);
      archive.pipe(output);

      // Add files to archive
      files.forEach(file => {
        const filePath = path.join(uploadDir, file.file_path);
        archive.file(filePath, { name: file.original_filename });
      });

      archive.finalize();
    });
  }
}

// Create singleton instance
const fileService = new FileService();

module.exports = fileService;
