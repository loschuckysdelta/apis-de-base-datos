import { NextResponse } from 'next/server';
import { connectDB } from '../../../lib/mongodb';
import User from '../../../models/User';
import Contacto from '../../../models/Contacto';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    await connectDB();
    // Todo el panel trabaja con hora de Perú (UTC-5, sin horario de verano).
    // Calculamos el inicio del día de Lima expresado en UTC para consultar MongoDB correctamente.
    const now = new Date();
    const limaNow = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const today = new Date(Date.UTC(
      limaNow.getUTCFullYear(),
      limaNow.getUTCMonth(),
      limaNow.getUTCDate(),
      5, 0, 0, 0
    ));
    const sevenDays = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    const [total, bloqueados, contactos, nuevosHoy, serie] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ botBloqueado: true }),
      Contacto.countDocuments(),
      User.countDocuments({ fechaRegistro: { $gte: today } }),
      User.aggregate([
        { $match: { fechaRegistro: { $gte: sevenDays } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$fechaRegistro', timezone: 'America/Lima' } }, cantidad: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    ]);
    const activos = Math.max(total - bloqueados, 0);
    return NextResponse.json({ success: true, total, activos, bloqueados, contactos, nuevosHoy, serie }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Error al consultar las estadísticas' }, { status: 500 });
  }
}
