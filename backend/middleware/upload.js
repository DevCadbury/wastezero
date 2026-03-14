const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const allowedFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'pdf', 'doc', 'docx', 'txt'];

const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    let folder = 'wastezero/general';
    let resource_type = 'auto';
    if (req.uploadFolder) folder = `wastezero/${req.uploadFolder}`;
    return { folder, resource_type, allowed_formats: allowedFormats };
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (allowedFormats.includes(ext)) return cb(null, true);
    cb(new Error('File type not allowed'));
  },
});

// Helper: delete a file from Cloudinary by URL
const deleteFromCloudinary = async (url) => {
  try {
    if (!url) return;
    const parts = url.split('/');
    const fileName = parts[parts.length - 1].split('.')[0];
    const folder = parts.slice(parts.indexOf('wastezero')).slice(0, -1).join('/');
    const publicId = `${folder}/${fileName}`;
    await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
  } catch (_) { /* swallow */ }
};

module.exports = { upload, cloudinary, deleteFromCloudinary };
