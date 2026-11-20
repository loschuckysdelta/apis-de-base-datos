import { adminAuthorized, unauthorized } from '../../../../lib/admin-auth';
import {connectDB} from '../../../../lib/mongodb';
import Vip from '../../../../models/VipMembership';
import {response} from '../../../../lib/vip';
export async function POST(req){
  if (!(adminAuthorized(req))) return unauthorized();
  try {
    const b=await req.json();
    const userId=String(b.telegramUserId||'');
    if(!/^\d{1,20}$/.test(userId)||typeof b.inviteLink!=='string')return response({success:false,error:'Datos inválidos'},400);
    await connectDB();
    const now=new Date();
    const m=await Vip.findOneAndUpdate(
      {inviteLink:b.inviteLink,status:'pending'},
      [{$set:{telegramUserId:userId,username:String(b.username||'').slice(0,64),activatedAt:now,
        expiresAt:{$cond:['$permanent',null,{$add:[now,{$multiply:['$days',86400000]}]}]},
        status:{$cond:['$permanent','permanent','active']}}}],
      {new:true}
    );
    if(!m){
      const existing=await Vip.findOne({inviteLink:b.inviteLink});
      if(existing&&existing.telegramUserId===userId&&existing.status!=='pending')return response({success:true,membership:existing,alreadyActivated:true});
      return response({success:false,error:'Enlace no disponible'},404);
    }
    return response({success:true,membership:m});
  }catch(e){console.error('VIP activate:',e);return response({success:false,error:'No se pudo activar el VIP'},500);}
}
