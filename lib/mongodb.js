import mongoose from 'mongoose';

const globalCache = globalThis.__mongooseCache || { conn: null, promise: null };
globalThis.__mongooseCache = globalCache;

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Falta configurar MONGODB_URI en Vercel');

  if (globalCache.conn && mongoose.connection.readyState === 1) {
    return globalCache.conn;
  }

  // A resolved promise can be stale after the database disconnects.
  if (mongoose.connection.readyState === 0) {
    globalCache.conn = null;
    globalCache.promise = null;
  }

  if (!globalCache.promise) {
    const options = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 20000
    };

    if (process.env.MONGODB_DB) {
      options.dbName = process.env.MONGODB_DB.trim();
    }

    globalCache.promise = mongoose.connect(uri, options);
  }

  try {
    globalCache.conn = await globalCache.promise;
    return globalCache.conn;
  } catch (error) {
    globalCache.promise = null;
    globalCache.conn = null;
    throw error;
  }
}
