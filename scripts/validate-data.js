// 驗證內建資料：重複 id、欄位缺漏、快選/組合碼引用不存在的代碼
import data from '../src/data/icd10-data.js';

const ORGANS = ['Respiratory', 'Cardiovascular', 'Renal', 'Digestive', 'Endocrine', 'Neurological', 'Surgical', 'Infectious', 'Other'];
const entries = data.entries;
const ids = entries.map(x => x.id);
const duplicateIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
const bad = entries.filter(x => !x.id || !x.code || !x.standard || !Array.isArray(x.keywords) || !ORGANS.includes(x.organ));
const codes = new Set(entries.map(x => x.code));
const refs = [...data.commonCodes.flatMap(g => g.items.map(i => i.code)), ...data.bundles.flatMap(b => b.codes)];
const missingRefs = refs.filter(c => !codes.has(c));

const report = { version: data.version, total: entries.length, duplicateIds, bad: bad.map(x => x.id), missingRefs };
console.log(JSON.stringify(report, null, 2));
if (duplicateIds.length || bad.length || missingRefs.length) process.exit(1);
