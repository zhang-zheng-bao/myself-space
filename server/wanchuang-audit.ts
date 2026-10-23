import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export type Operation = { id: string; createdAt: number; actor: string; operation: string; status: string; durationMs: number; error: string; reference: string };
const directory=()=>path.resolve(process.env.WANCHUANG_AUDIT_DIR || '.private/wanchuang-audit');
export function recordOperation(entry: Omit<Operation,'id'|'createdAt'>) {
  const row={...entry,id:crypto.randomUUID(),createdAt:Date.now()};
  fs.mkdirSync(directory(),{recursive:true,mode:0o700});
  fs.appendFileSync(path.join(directory(),new Date().toISOString().slice(0,10)+'.jsonl'),JSON.stringify(row)+'\n',{mode:0o600});
}
export function operationHistory(page: number,query: string) {
  const rows: Operation[]=[];
  if(fs.existsSync(directory())) for(const file of fs.readdirSync(directory()).filter(f=>/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort().reverse()) {
    const lines=fs.readFileSync(path.join(directory(),file),'utf8').trim().split('\n').reverse();
    for(const line of lines) {try{const row=JSON.parse(line) as Operation;if(!query || `${row.operation} ${row.status} ${row.error} ${row.reference}`.toLowerCase().includes(query.toLowerCase()))rows.push(row);}catch{/* Incomplete final line is ignored. */}}
  }
  return {rows:rows.slice((page-1)*30,page*30),total:rows.length};
}
