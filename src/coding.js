// 編碼引擎：忽略清單、語意修飾詞偵測、文字分析

// 模擬的藥物/無關詞彙過濾清單
export const IGNORE_LIST = [
    'ASPIRIN', 'PLAVIX', 'METFORMIN', 'LASIX', 'KCL', 'N/S', 'BOKEY', 'NORVASC', 
    'LIPITOR', 'INSULIN', 'ANTIBIOTICS', 'IV', 'PO', 'BID', 'QID', 'TID', 'PRN', 
    'ADMISSION', 'DISCHARGE', 'MBD', 'OBSERVATION', 'VITALS', 'BP', 'HR', 'RR', 'BT',
    'CURRENT MEDICATIONS', 'ALLERGIES', 'PLAN', 'SOAP'
];


// --- 語意修飾詞偵測 (NegEx-lite) ---
// scope 'after'：修飾其後方的診斷 (No DM)；scope 'before'：修飾其前方的診斷 (糖尿病病史)
// 修飾詞若落在匹配的關鍵字本身之內 (如 "SUSPECTED FLU")，不會套用。
const QUALIFIER_TRIGGERS = [
    { re: /\b(NO|NOT|DENIES|DENIED|DENY|NEGATIVE FOR|FREE OF|ABSENCE OF|RULED OUT)\b/g, type: 'negated', scope: 'after' },
    { re: /^\s*(WITHOUT|W\/O)\b/g, type: 'negated', scope: 'after' },
    { re: /(否認|沒有|未見|無明顯|已排除)/g, type: 'negated', scope: 'after' },
    { re: /^\s*無(?=\s|[A-Z])/g, type: 'negated', scope: 'after' },
    { re: /\b(R\/O|RULE OUT|SUSPECTED|SUSPECT|SUSPICIOUS FOR|POSSIBLE|PROBABLE|LIKELY|QUESTIONABLE)\b/g, type: 'uncertain', scope: 'after' },
    { re: /(疑似|懷疑|待排除|(?<!已)排除|可能)/g, type: 'uncertain', scope: 'after' },
    { re: /\b(HX OF|H\/O|HISTORY OF|S\/P|STATUS POST|PREVIOUS|PRIOR)\b/g, type: 'history', scope: 'after' },
    { re: /(曾有|曾經|過去有)/g, type: 'history', scope: 'after' },
    { re: /(病史|術後)/g, type: 'history', scope: 'before' }
];
// 轉折詞：中斷修飾詞的作用範圍 (No fever but DM → DM 不被否定)
const QUALIFIER_TERMINATORS = /\b(BUT|HOWEVER|EXCEPT)\b|但是|但|卻/g;
// 狀態/病史類 Z 碼本身就代表病史，不再標記為「病史」
const STATUS_CODE_REGEX = /^Z(79|8\d|9\d)/;
const QUALIFIER_RANK = { none: 0, history: 1, uncertain: 1, negated: 2 };

const findAllMatches = (re, text) => {
    const out = [];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        out.push({ start: m.index, end: m.index + m[0].length });
        if (m[0].length === 0) re.lastIndex++;
    }
    return out;
};

export const detectQualifier = (segment, matchStart, matchEnd) => {
    const terminators = findAllMatches(QUALIFIER_TERMINATORS, segment);
    const blocked = (from, to) => terminators.some(t => t.start >= from && t.end <= to);
    let best = null; // { type, distance }

    QUALIFIER_TRIGGERS.forEach(({ re, type, scope }) => {
        findAllMatches(re, segment).forEach(t => {
            let distance = null;
            if (scope === 'after' && t.end <= matchStart && !blocked(t.end, matchStart)) {
                distance = matchStart - t.end;
            } else if (scope === 'before' && t.start >= matchEnd && !blocked(matchEnd, t.start)) {
                distance = t.start - matchEnd;
            }
            if (distance !== null && (!best || distance < best.distance)) {
                best = { type, distance };
            }
        });
    });

    return best ? best.type : null;
};

export const QUALIFIER_LABELS = {
    uncertain: { text: '疑似 / R/O', className: 'bg-amber-100 text-amber-800' },
    history: { text: '病史 / 術後', className: 'bg-indigo-100 text-indigo-800' },
    negated: { text: '否定', className: 'bg-slate-200 text-slate-600' }
};

// 主要編碼分析：輸入臨床文字與規則庫，回傳結果陣列
// 每筆結果含 qualifier: null (確定) | 'uncertain' (疑似) | 'history' (病史) | 'negated' (否定)
export const analyzeText = (inputText, database) => {
    // 保護 ICD 小數點 (E03.9) 與常見斜線縮寫 (R/O, S/P, H/O, W/O)，避免被切割符號拆開
    const protectedInputText = inputText
        .replace(/\b([A-Z]\d{2})\.(\d[A-Z0-9]*)\b/gi, '$1§$2')
        .replace(/\b([RSHW])\/([OP])\b/gi, '$1¤$2');
    const segments = protectedInputText
        .split(/[\n,;，、。/:().?]+/)
        .map(s => s.replace(/§/g, '.').replace(/¤/g, '/').trim())
        .filter(s => s.length > 0);

    // 預先編譯忽略清單 (藥物、頻次等)：只遮蔽該詞本身，不再整段丟棄
    const ignoreRegexes = IGNORE_LIST.map(ignore => {
        const escaped = ignore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return { re: new RegExp(`\\b${escaped}\\b`, 'g'), wordRe: new RegExp(`\\b${escaped}\\b`) };
    });

    const collected = [];

    const processSegment = (rawSegment) => {
    const cleanSegment = rawSegment.toUpperCase();
    if (cleanSegment.length < 2) return;

    // 將忽略詞替換為等長的 #，保留字元位置以便判斷修飾詞距離
    let maskedSegment = cleanSegment;
    ignoreRegexes.forEach(({ re }) => {
        maskedSegment = maskedSegment.replace(re, m => '#'.repeat(m.length));
    });

    const matchesByCode = new Map();

    database.forEach(entry => {
        const searchableTerms = [
            entry.code,
            entry.standard,
            ...(entry.keywords || [])
        ].filter(Boolean);

        searchableTerms.forEach(keyword => {
        const k = String(keyword).toUpperCase();
        // 關鍵字本身含忽略詞 (如 "INSULIN USE") 時，比對原文；否則比對遮蔽後文字
        const target = ignoreRegexes.some(({ wordRe }) => wordRe.test(k)) ? cleanSegment : maskedSegment;
        let matchStart = -1;

        const isEnglishKeyword = /^[A-Z0-9\s\-\.]+$/.test(k);

        if (isEnglishKeyword) {
            const escapedK = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const m = new RegExp(`\\b${escapedK}\\b`).exec(target);
            if (m) matchStart = m.index;
        } else {
            matchStart = target.indexOf(k);
        }

        if (matchStart >= 0) {
            let currentScore = k.length;
            
            if (cleanSegment === k) {
                currentScore += 100;
            }

            const existing = matchesByCode.get(entry.code);
            if (!existing || currentScore > existing.relevance) {
            matchesByCode.set(entry.code, {
                ...entry,
                original: rawSegment,
                relevance: currentScore,
                matchStart,
                matchEnd: matchStart + k.length
            });
            }
        }
        });
    });

    Array.from(matchesByCode.values())
        .sort((a, b) => b.relevance - a.relevance || a.code.localeCompare(b.code))
        .forEach(match => {
        const { relevance, matchStart, matchEnd, ...result } = match;
        let qualifier = detectQualifier(cleanSegment, matchStart, matchEnd);
        if (qualifier === 'history' && STATUS_CODE_REGEX.test(result.code)) {
            qualifier = null;
        }
        collected.push({ ...result, qualifier });
        });
    };

    segments.forEach(seg => {
    processSegment(seg);
    });

    // 同一代碼只保留一次：確定 > 疑似/病史 > 否定
    const newResults = [];
    const indexByCode = new Map();
    collected.forEach(item => {
        const rank = QUALIFIER_RANK[item.qualifier || 'none'];
        if (!indexByCode.has(item.code)) {
            indexByCode.set(item.code, newResults.length);
            newResults.push(item);
        } else {
            const idx = indexByCode.get(item.code);
            if (rank < QUALIFIER_RANK[newResults[idx].qualifier || 'none']) {
                newResults[idx] = item;
            }
        }
    });

    return newResults;
};
