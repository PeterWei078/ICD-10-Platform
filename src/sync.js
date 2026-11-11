import qrcode from 'qrcode-generator';

// --- 規則同步：將自訂規則壓縮成網址 hash (#rules=z.xxxx) ---
// hash 不會送到伺服器，資料只在兩台裝置之間傳遞
const bytesToBase64Url = (bytes) => {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const base64UrlToBytes = (text) => {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
};

const canCompress = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

export const encodeRulesPayload = async (rules) => {
    const json = JSON.stringify(rules.map(({ isCustom, ...rest }) => rest));
    const bytes = new TextEncoder().encode(json);
    if (canCompress) {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
        return `z.${bytesToBase64Url(compressed)}`;
    }
    return `j.${bytesToBase64Url(bytes)}`;
};

export const RULES_LINK_REGEX = /#rules=([zj])\.([A-Za-z0-9_-]+)/;

export const decodeRulesPayload = async (mode, data) => {
    let bytes = base64UrlToBytes(data);
    if (mode === 'z') {
        if (!canCompress) throw new Error('此瀏覽器不支援解壓縮');
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(parsed)) throw new Error('格式錯誤');
    return parsed.filter(r => r && r.id && r.code && r.standard && Array.isArray(r.keywords));
};

export const makeQrSvg = (text) => {
    // 超過約 1200 字元的 QR 在螢幕上過於密集難以掃描，改用連結/分享
    if (typeof qrcode !== 'function' || text.length > 1200) return null;
    try {
        const qr = qrcode(0, 'L');
        qr.addData(text);
        qr.make();
        return qr.createSvgTag(4, 8);
    } catch (e) {
        return null; // 內容超過 QR 容量
    }
};
