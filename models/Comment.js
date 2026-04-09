/**
 * models/Comment.js - Mongoose Comment schema
 */

const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    manga: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Manga',
      required: true,
    },
    chapterNumber: {
      type: Number,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: [true, 'Comment content is required'],
      trim: true,
      maxlength: [1000, 'Comment must not exceed 1000 characters'],
    },
  },
  { timestamps: true }
);

// High-performance index for retrieving comments for a specific chapter
commentSchema.index({ manga: 1, chapterNumber: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);
