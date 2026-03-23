import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPreviewRelativePath, getThumbnailRelativePath } from '../src/utils/image-utils.js';

type AppConfigModule = typeof import('../src/config/env.js');
type GalleryServiceModule = typeof import('../src/services/gallery-service.js');
type ScannerServiceModule = typeof import('../src/services/scanner-service.js');
type RepositoriesModule = typeof import('../src/db/repositories.js');

const generateThumbnailDerivativeMock = vi.fn();
const generateDerivativesMock = vi.fn();
const readMediaMetadataMock = vi.fn();

describe.sequential('folder customization scan behavior', () => {
  let tempRoot = '';
  let appConfig: AppConfigModule['appConfig'];
  let galleryService: GalleryServiceModule['galleryService'];
  let scannerService: ScannerServiceModule['scannerService'];
  let imageRepository: RepositoriesModule['imageRepository'];
  let folderRepository: RepositoriesModule['folderRepository'];
  let maintenanceRepository: RepositoriesModule['maintenanceRepository'];

  beforeAll(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'insta-folder-customization-scan-'));

    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATA_ROOT', path.join(tempRoot, 'data'));
    vi.stubEnv('GALLERY_ROOT', path.join(tempRoot, 'gallery'));
    vi.stubEnv('DB_DIR', path.join(tempRoot, 'db'));
    vi.stubEnv('THUMBNAILS_DIR', path.join(tempRoot, 'thumbnails'));
    vi.stubEnv('PREVIEWS_DIR', path.join(tempRoot, 'previews'));
  });

  beforeEach(async () => {
    generateThumbnailDerivativeMock.mockReset();
    generateDerivativesMock.mockReset();
    readMediaMetadataMock.mockReset();

    await fs.rm(tempRoot, { recursive: true, force: true });
    await fs.mkdir(tempRoot, { recursive: true });

    vi.resetModules();
    vi.doMock('../src/services/derivative-service.js', () => ({
      generateDerivatives: generateDerivativesMock,
      generateThumbnailDerivative: generateThumbnailDerivativeMock,
      readMediaMetadata: readMediaMetadataMock
    }));

    ({ appConfig } = await import('../src/config/env.js'));
    ({ galleryService } = await import('../src/services/gallery-service.js'));
    ({ scannerService } = await import('../src/services/scanner-service.js'));
    ({ imageRepository, folderRepository, maintenanceRepository } = await import('../src/db/repositories.js'));

    await Promise.all([
      fs.mkdir(appConfig.galleryRoot, { recursive: true }),
      fs.mkdir(appConfig.thumbnailsDir, { recursive: true }),
      fs.mkdir(appConfig.previewsDir, { recursive: true })
    ]);

    readMediaMetadataMock.mockResolvedValue({
      width: 1000,
      height: 1000,
      takenAt: null,
      durationMs: null,
      mediaType: 'image',
      playbackStrategy: 'preview',
      isAnimated: false
    });

    generateDerivativesMock.mockImplementation(async (_sourcePath: string, relativePath: string) => ({
      width: 1000,
      height: 1000,
      takenAt: null,
      durationMs: null,
      mediaType: 'image',
      playbackStrategy: 'preview',
      isAnimated: false,
      thumbnailPath: getThumbnailRelativePath(relativePath),
      previewPath: getPreviewRelativePath(relativePath, 'image'),
      generatedThumbnail: true,
      generatedPreview: true
    }));
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('preserves a customized folder name and description across normal rescans', async () => {
    maintenanceRepository.resetLibraryIndex();

    await createSourceFile('albums/photo-1.jpg');
    await scannerService.scanAll('manual');

    const updatedFolder = galleryService.updateFolderMetadata('albums', 'Custom Album', 'Hand-picked description');
    expect(updatedFolder?.name).toBe('Custom Album');
    expect(updatedFolder?.description).toBe('Hand-picked description');

    await createSourceFile('albums/photo-2.jpg');
    await scannerService.scanAll('manual');

    const rescannedFolder = folderRepository.getBySlug('albums');
    expect(rescannedFolder?.name).toBe('Custom Album');
    expect(rescannedFolder?.description).toBe('Hand-picked description');
  });

  it('preserves a manually selected cover across normal rescans', async () => {
    maintenanceRepository.resetLibraryIndex();

    await createSourceFile('albums/photo-1.jpg', 1000);
    await createSourceFile('albums/photo-2.jpg');
    await scannerService.scanAll('manual');

    const manualCover = imageRepository.getByRelativePath('albums/photo-1.jpg');
    expect(manualCover).toBeDefined();
    expect(galleryService.setFolderAvatar('albums', manualCover!.id)).toBe(true);

    await createSourceFile('albums/photo-3.jpg');
    await scannerService.scanAll('manual');

    const rescannedFolder = folderRepository.getBySlug('albums');
    expect(rescannedFolder?.avatar_image_id).toBe(manualCover!.id);
    expect(rescannedFolder?.avatar_source).toBe('manual');
  });

  it('detects case-insensitive cover files in child albums and hides them from the feed, folder grid, and detail view', async () => {
    maintenanceRepository.resetLibraryIndex();

    await createSourceFile('family/trip/photo-1.jpg');
    await createSourceFile('family/trip/Cover.JPG', 1000);
    await scannerService.scanAll('manual');

    const folder = folderRepository.getByFolderPath('family/trip');
    const coverImage = imageRepository.getByRelativePath('family/trip/Cover.JPG');
    const visiblePhoto = imageRepository.getByRelativePath('family/trip/photo-1.jpg');

    expect(folder).toBeDefined();
    expect(coverImage).toBeDefined();
    expect(visiblePhoto).toBeDefined();
    expect(folder?.avatar_image_id).toBe(coverImage?.id);
    expect(folder?.avatar_source).toBe('cover');

    const folderPayload = galleryService.getFolderImages(folder!.slug, 1, 24);
    expect(folderPayload?.total).toBe(1);
    expect(folderPayload?.folder.avatarImageId).toBe(coverImage!.id);
    expect(folderPayload?.items.map((item) => item.id)).toEqual([visiblePhoto!.id]);
    expect(folderPayload?.items.map((item) => item.id)).not.toContain(coverImage!.id);

    const feedPayload = galleryService.getFeed(1, 24, 'recent');
    expect(feedPayload.items.map((item) => item.id)).not.toContain(coverImage!.id);

    expect(galleryService.getImageDetail(coverImage!.id)?.id).toBe(coverImage!.id);
  });

  async function createSourceFile(relativePath: string, mtimeOffsetMs = 0): Promise<void> {
    const absolutePath = path.join(appConfig.galleryRoot, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, `source:${relativePath}`);

    if (mtimeOffsetMs) {
      const now = new Date();
      now.setMilliseconds(now.getMilliseconds() - mtimeOffsetMs);
      await fs.utimes(absolutePath, now, now);
    }
  }
});
