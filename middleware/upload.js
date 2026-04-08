const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Cloudinary auto-configures if CLOUDINARY_URL is present in process.env
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'skibiditoiletarchive',
    allowed_formats: ['jpg', 'png', 'webp', 'gif', 'jpeg'],
  },
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = upload;
