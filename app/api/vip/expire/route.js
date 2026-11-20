import {connectDB} from '../../../../lib/mongodb';
import Vip from '../../../../models/VipMembership';
import {response} from '../../../../lib/vip';
export async function POST(req){try{await connectDB();const result=await Vip.updateMany({status:'active',permanent:false,expiresAt:{$lte:new Date()}},{$set:{status:'expired'}});return response({success:true,expired:result.modifiedCount,removed:0,message:'Solo actualiza estados. No expulsa usuarios.'});}catch(e){return response({error:'Error interno del servidor'},500);}}
