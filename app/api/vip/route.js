import { adminAuthorized, unauthorized } from '../../../lib/admin-auth';
import {connectDB} from '../../../lib/mongodb';
import Vip from '../../../models/VipMembership';
import {response,validDays,computedStatus} from '../../../lib/vip';
export const dynamic='force-dynamic';
export async function GET(req){
  if (!(adminAuthorized(req))) return unauthorized();try{await connectDB();const docs=await Vip.find({}).sort({createdAt:-1}).limit(500).lean();return response({success:true,memberships:docs.map(m=>({...m,status:computedStatus(m)}))});}catch(e){return response({error:'Error al consultar membresías'},500);}}
export async function POST(req){
  if (!(adminAuthorized(req))) return unauthorized();try{const b=await req.json();const userId=String(b.telegram_user_id||b.telegramUserId||'').trim(),permanent=b.permanent===true,days=Number(b.days);if(!/^\d{1,20}$/.test(userId))return response({error:'ID Telegram inválido'},400);if(!permanent&&!validDays(days))return response({error:'Días inválidos (1-36500)'},400);await connectDB();if(await Vip.exists({telegramUserId:userId,status:{$in:['active','permanent','pending']}}))return response({error:'El usuario ya tiene una membresía. Usa el lápiz para editarla.'},409);const now=new Date();const m=await Vip.create({telegramUserId:userId,username:String(b.telegram_username||b.username||'').slice(0,64),days:permanent?null:days,permanent,status:permanent?'permanent':'active',activatedAt:now,expiresAt:permanent?null:new Date(now.getTime()+days*86400000)});return response({success:true,membership:m},201);}catch(e){return response({error:'No se pudo registrar el VIP'},500);}}
