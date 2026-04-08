/**
 * models/Manga.js - Mongoose Manga schema
 */

const mongoose = require('mongoose');

// Schema for individual chapters
const chapterSchema = new mongoose.Schema({
  chapterNumber: { type: Number, required: true },
  title: { type: String, default: '' },
  pages: [
    {
      filename: String,     // stored filename
      originalName: String, // original upload name
      url: String,          // /uploads/manga-id/chapter-X/filename
    },
  ],
  uploadedAt: { type: Date, default: Date.now },
});

const mangaSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [150, 'Title must not exceed 150 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description must not exceed 2000 characters'],
      default: '',
    },
    // Cover image URL path
    coverImage: {
      type: String,
      default: null,
    },
    // Genres/tags
    genres: [{ type: String, trim: true }],
    // Author name
    author: {
      type: String,
      trim: true,
      default: 'Unknown',
    },
    // Status: ongoing, completed, hiatus
    status: {
      type: String,
      enum: ['ongoing', 'completed', 'hiatus'],
      default: 'ongoing',
    },
    // Uploader reference
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Chapters array
    chapters: [chapterSchema],
    // View counter
    views: {
      type: Number,
      default: 0,
    },
    // Rating (1–5 average)
    rating: {
      total: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// Virtual for average rating
mangaSchema.virtual('averageRating').get(function () {
  if (this.rating.count === 0) return 0;
  return (this.rating.total / this.rating.count).toFixed(1);
});

// Text index for search
mangaSchema.index({ title: 'text', description: 'text', author: 'text' });

module.exports = mongoose.model('Manga', mangaSchema);
