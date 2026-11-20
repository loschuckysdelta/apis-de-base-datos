import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  chatId: {type:String,default:""}, inviteLink:{type:String,sparse:true,unique:true},
  days:{type:Number,default:null}, permanent:{type:Boolean,default:false},
  telegramUserId:{type:String,default:null}, username:{type:String,default:''},
  status:{type:String,enum:['pending','active','expired','removed','permanent'],default:'pending'},
  activatedAt:{type:Date,default:null}, expiresAt:{type:Date,default:null},
  removedAt:{type:Date,default:null}
},{timestamps:true});
schema.index({status:1,expiresAt:1});
export default mongoose.models.VipMembership || mongoose.model('VipMembership',schema);
