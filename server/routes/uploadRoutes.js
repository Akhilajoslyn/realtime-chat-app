const express = require("express");
const router = express.Router();
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");
const verifyToken = require("../middleware/authMiddleware");

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: "realtime-chat/profile-pictures",
    resource_type: "auto",
    public_id: `${Date.now()}-${file.originalname.split(".")[0]}`,
  }),
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter(req, file, cb) {
    const allowed =
      /\.(jpeg|jpg|png|gif|webp|pdf|doc|docx|txt|zip|mp4|mp3)$/i;

    if (allowed.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("File type not allowed"));
    }
  },
});

router.post("/upload", verifyToken, (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        message: err.message,
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "No file uploaded",
      });
    }

    const imageExtensions = /\.(jpe?g|png|gif|webp)$/i;

    res.json({
      url: req.file.path,
      type: imageExtensions.test(req.file.originalname)
        ? "image"
        : "file",
      name: req.file.originalname,
    });
  });
});

module.exports = router;