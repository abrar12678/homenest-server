export {};

const axios = require('axios');

const IMGBB_API_KEY = process.env.IMGBB_API_KEY || '';

/**
 * POST /api/upload/image
 * Upload an image to ImgBB and return the URL
 * Body: { image: base64 string (without data:prefix) }
 */
async function uploadImage(req: any, res: any): Promise<void> {
  try {
    const { image } = req.body;

    if (!image || typeof image !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Image data (base64) is required.',
      });
    }

    // Validate base64 — strip data:image/xxx;base64, prefix if present
    let base64Data = image;
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1];
    }

    // Basic size check (max 10MB base64 ≈ 13.3M chars)
    if (base64Data.length > 13_000_000) {
      return res.status(400).json({
        success: false,
        message: 'Image size must be under 10MB.',
      });
    }

    if (!IMGBB_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Image upload service is not configured.',
      });
    }

    const formData = new URLSearchParams();
    formData.append('key', IMGBB_API_KEY);
    formData.append('image', base64Data);

    const response = await axios.post(
      'https://api.imgbb.com/1/upload',
      formData,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 30000,
      }
    );

    const data = response.data;
    if (data.success && data.data?.display_url) {
      res.status(200).json({
        success: true,
        data: {
          url: data.data.display_url,
          thumb: data.data.thumb?.url || data.data.display_url,
          deleteUrl: data.data.delete_url || '',
        },
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Image upload failed. Please try again.',
      });
    }
  } catch (error: any) {
    console.error('ImgBB upload error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Image upload failed. Please try again.',
    });
  }
}

module.exports = { uploadImage };