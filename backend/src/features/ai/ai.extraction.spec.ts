import test from 'node:test';
import assert from 'node:assert/strict';
import { extractQuestionsFromImagesService } from './ai.extraction.service';

test('Extraction service rejects empty images array', async () => {
  await assert.rejects(
    async () => {
      await extractQuestionsFromImagesService({ images: [] });
    },
    { message: 'No images provided for extraction' }
  );
});

test('Extraction service enforces maximum batch limit of 10 images', async () => {
  const dummyImages = Array.from({ length: 11 }, (_, i) => ({
    base64Data: 'dummy_base64_data',
    mimeType: 'image/jpeg',
    fileName: `img_${i}.jpg`,
  }));

  await assert.rejects(
    async () => {
      await extractQuestionsFromImagesService({ images: dummyImages });
    },
    { message: 'A maximum of 10 images can be processed per batch' }
  );
});
