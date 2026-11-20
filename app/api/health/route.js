import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '../../../lib/mongodb';
import User from '../../../models/User';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function json(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
    }
  });
}

export async function GET(req) {
  const started = Date.now();
  try {
    await connectDB();
    await mongoose.connection.db.admin().ping();
    const usersCount = await User.countDocuments();

    return json({
      success: true,
      api: 'operativa',
      mongodb: 'conectada',
      database: mongoose.connection.name,
      collection: 'users',
      usersCount,
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return json({
      success: false,
      api: 'operativa',
      mongodb: 'desconectada',
      latencyMs: Date.now() - started,
      error: 'No se pudo conectar con MongoDB',
      timestamp: new Date().toISOString()
    }, 503);
  }
}
