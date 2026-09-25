const { serializeImage } = require('./imageContract.cjs');

const POLICY_VERSION = 'approved-4-8-v1';
const TIERS = ['T1', 'T2', 'T3', 'UNUSABLE'];
const ASSESSMENT_VERSIONS = new Set(['website-approval-luna-v1', 'website-approval-sol-batch-v1']);
const SCENES = ['INDOOR', 'OUTDOOR'];
const OVERVIEWS = new Set(['INTERIOR_OVERVIEW', 'EXTERIOR_FACADE', 'LOADING_DOCK', 'YARD', 'LAND']);

function candidate(row, order) {
    const a = row.websiteAssessment;
    if (row.websiteStatus !== 'READY' || !row.websiteAssessedAt || !a
        || !ASSESSMENT_VERSIONS.has(a.version) || !a.model
        || !/^[a-f0-9]{64}$/.test(a.sourceSha256 || '')
        || !SCENES.includes(row.classification) || !SCENES.includes(a.scene)
        || !Number.isFinite(a.sourceWidth) || !Number.isFinite(a.sourceHeight)
        || !(a.sourceWidth > 0 && a.sourceHeight > 0)) return null;

    let decision = row.websiteDecision, tier = row.websiteQualityTier;
    if (row.websiteOverride != null) {
        const override = row.websiteOverride;
        // Only trusted staff writers populate this field. An approval must be
        // bound to the assessed original; malformed/stale overrides withhold it.
        if (override.sourceSha256 !== a.sourceSha256 || !override.reviewedBy
            || !Number.isFinite(Date.parse(override.reviewedAt)) || typeof override.reason !== 'string' || !override.reason.trim()
            || !['ALLOW','BLOCK','REVIEW'].includes(override.decision)) return null;
        decision = override.decision;
        tier = override.qualityTier ?? tier;
    } else if (a.decision !== decision || a.qualityTier !== tier || !Array.isArray(a.reasons) || a.reasons.length) return null;
    if (decision !== 'ALLOW' || !TIERS.slice(0,3).includes(tier)) return null;

    const modelTier = TIERS.includes(a.modelQualityTier) ? a.modelQualityTier : tier;
    const longest = Math.max(a.sourceWidth, a.sourceHeight);
    const ceiling = longest < 640 ? 'T3' : longest < 960 ? 'T2' : 'T1';
    if (TIERS.indexOf(tier) < TIERS.indexOf(ceiling)) tier = ceiling;
    const overview = OVERVIEWS.has(a.view);
    return { row, order, tier, modelTier, scene: row.classification, view: a.view,
        hash: a.sourceSha256, overview,
        cover: a.coverSuitable === true && overview && Math.min(a.sourceWidth, a.sourceHeight * 16 / 9) >= 640 };
}

// Approval is a hard gate; photographic quality controls only eligible images.
// Existing scene labels drive the split. The new model's scene cannot relabel
// an image or turn a document into a gallery photo.
function selectWebsiteImages(rows, { minimum = 4, maximum = 8 } = {}) {
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 0 || maximum < minimum) throw new Error('Invalid gallery bounds');
    const rank = (a,b) => TIERS.indexOf(a.tier)-TIERS.indexOf(b.tier);
    const seen = new Set();
    const candidates = rows.map(candidate).filter(Boolean)
        .sort((a,b) => rank(a,b) || Number(b.cover)-Number(a.cover) || a.order-b.order)
        .filter(item => { if (seen.has(item.hash)) return false; seen.add(item.hash); return true; });
    const pools = Object.fromEntries(SCENES.map(scene => [scene, candidates.filter(c => c.scene === scene && c.tier !== 'T3')]));
    const total = Math.min(maximum, pools.INDOOR.length + pools.OUTDOOR.length);
    const quota = { INDOOR: Math.min(Math.ceil(total/2), pools.INDOOR.length), OUTDOOR: Math.min(Math.floor(total/2), pools.OUTDOOR.length) };
    let remaining = total - quota.INDOOR - quota.OUTDOOR;
    for (const scene of SCENES) { const extra = Math.min(remaining,pools[scene].length-quota[scene]); quota[scene]+=extra; remaining-=extra; }
    const picked = [];
    while (picked.length < total) for (const scene of SCENES) if (quota[scene] > 0) {
        const views = new Set(picked.map(item => item.view));
        pools[scene].sort((a,b) => rank(a,b) || Number(views.has(a.view))-Number(views.has(b.view))
            || Number(b.cover)-Number(a.cover) || Number(b.overview)-Number(a.overview) || a.order-b.order);
        picked.push(pools[scene].shift()); quota[scene]--;
    }
    const weak = candidates.filter(c => c.tier === 'T3');
    while (weak.length && picked.length < minimum) {
        const counts = { INDOOR:0, OUTDOOR:0 }; for (const c of picked) counts[c.scene]++;
        weak.sort((a,b) => TIERS.indexOf(a.modelTier)-TIERS.indexOf(b.modelTier)
            || counts[a.scene]-counts[b.scene] || Number(b.overview)-Number(a.overview) || a.order-b.order);
        picked.push(weak.shift());
    }
    const cover = [...picked].sort((a,b) => Number(b.cover)-Number(a.cover)
        || Number(b.overview)-Number(a.overview) || rank(a,b) || a.order-b.order)[0];
    const ordered = cover ? [cover,...picked.filter(c => c !== cover)] : [];
    return ordered.map(({row}) => serializeImage(row.imageUrl,row));
}

function publicImageFields(images = []) {
    return { images, photos: images.map(image => image.originalUrl), photosWebp: images.map(image => image.webpUrl) };
}

module.exports = { POLICY_VERSION, selectWebsiteImages, publicImageFields };
