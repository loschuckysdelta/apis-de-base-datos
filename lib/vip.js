import {NextResponse} from 'next/server';
export function response(data,status=200){return NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});}
export function validDays(days){return Number.isInteger(days)&&days>=1&&days<=36500;}
export function computedStatus(m){if(m.permanent&&m.status!=='pending')return 'permanent';if(m.status==='active'&&m.expiresAt&&new Date(m.expiresAt)<=new Date())return 'expired';return m.status;}
