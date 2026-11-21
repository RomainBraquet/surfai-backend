// Tests du moteur de prédiction — npm test
const assert = require('assert');
const { scoreSlot, learnWaveRange, learnWindTolerance } = require('../src/services/scorer');
const { tideAt, normalizeSession } = (() => {
  // collector charge Stormglass et Supabase : on fournit des variables factices pour les tests
  process.env.STORMGLASS_API_KEY = process.env.STORMGLASS_API_KEY || 'test';
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
  process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test';
  const log = console.log; console.log = () => {};
  const m = require('../src/services/collector'); console.log = log; return m;
})();
const { sunTimes, localParts, spotTimeZone, isDaylightSlot } = require('../src/services/timeUtils');
const { getBestWindows } = require('../src/services/recommender');

const profile = { surf_level: 'intermediate', min_wave_height: 0.8, max_wave_height: 2.0 };
const spot = { id: 's1', name: 'Test', lat: 43.48, lng: -1.56, ideal_wind: ['E', 'NE'], ideal_swell: ['W', 'NW'], ideal_tide: ['low'] };
const ctx = { profile, spot, pastSessions: [], boards: [] };
const perfect = { waveHeight: 1.4, swellHeight: 1.3, wavePeriod: 12, windSpeed: 8, windDirection: 90, waveDirection: 280, swellDirection: 280, tideLevel: 0.1, tidePhase: 'falling' };
const score = (slot, c = ctx) => scoreSlot(slot, c).score;
let n = 0; const ok = (cond, msg) => { assert(cond, msg); n++; };

// Conditions parfaites
ok(score(perfect) >= 8.5, `conditions parfaites >= 8.5, obtenu ${score(perfect)}`);

// 1. La taille des vagues est décisive
ok(score({ ...perfect, waveHeight: 0.2, swellHeight: 0.2 }) < 3, 'océan plat sans vent doit être < 3');
ok(score({ ...perfect, waveHeight: 5, swellHeight: 5, wavePeriod: 16 }) < 3, '5 m pour un max de 2 m doit être < 3');
ok(scoreSlot({ ...perfect, waveHeight: 5, swellHeight: 5 }, ctx).sizeIssue === 'too_big', '5 m → trop gros');
ok(scoreSlot({ ...perfect, waveHeight: 0.2, swellHeight: 0.2 }, ctx).sizeIssue === 'too_small', '0,2 m → trop petit');

// 4. Le vent : plus il est fort de face, plus le score baisse, sans rebond au-delà de 50 km/h
const onshore = v => score({ ...perfect, windSpeed: v, windDirection: 280 });
[10, 20, 30, 40, 50, 51, 60, 80].reduce((prev, v) => { ok(onshore(v) <= prev, `vent de face ${v} km/h ne doit pas remonter`); return onshore(v); }, 10);
ok(onshore(55) < 4, `vent de face 55 km/h doit être < 4, obtenu ${onshore(55)}`);

// 5. Marée : le niveau compte, un spot sans fiche n'est pas favorisé
ok(score({ ...perfect, tideLevel: 0.1 }) > score({ ...perfect, tideLevel: 0.5 }), 'spot de marée basse : basse > mi-marée');
ok(score({ ...perfect, tideLevel: 0.5 }) > score({ ...perfect, tideLevel: 0.9 }), 'spot de marée basse : mi-marée > haute');
const noInfo = { ...spot, ideal_wind: null, ideal_swell: null, ideal_tide: null };
ok(score(perfect, { ...ctx, spot: noInfo }) <= score(perfect), 'un spot sans fiche ne dépasse pas un spot renseigné idéal');

// Marée calculée depuis les pleines et basses mers
const ext = [{ timestamp: 0, type: 'low' }, { timestamp: 22000, type: 'high' }, { timestamp: 44000, type: 'low' }];
ok(tideAt(600, ext).tidePhase === 'low' && tideAt(600, ext).tideLevel < 0.05, 'près de la basse mer → low');
ok(tideAt(11000, ext).tidePhase === 'rising' && Math.abs(tideAt(11000, ext).tideLevel - 0.5) < 0.02, 'mi-montant → rising, niveau 0,5');
ok(tideAt(21800, ext).tidePhase === 'high', 'près de la pleine mer → high');
ok(tideAt(33000, ext).tidePhase === 'falling', 'après la pleine mer → falling');

// 7. Mémoire du spot : seulement le même spot, seulement des conditions proches
const days = n => new Date(Date.now() - n * 86400000).toISOString();
const sess = (rating, over = {}, spotId = 's1', age = 30) => ({ rating, spot_id: spotId, date: days(age), meteo: { waveHeight: 1.4, swellHeight: 1.3, wavePeriod: 12, windSpeed: 8, windDirection: 90, swellDirection: 280, tideLevel: 0.1, ...over } });
const withS = list => ({ ...ctx, pastSessions: list });
const r0 = scoreSlot(perfect, ctx);
const mid = { ...perfect, windSpeed: 18, windDirection: 0, wavePeriod: 8, tideLevel: 0.5 }; // créneau moyen, pour voir la mémoire bouger la note
const m0 = scoreSlot(mid, ctx).score;
const sameMid = { windSpeed: 18, windDirection: 0, wavePeriod: 8, tideLevel: 0.5 };
ok(scoreSlot(mid, withS([sess(5, sameMid)])).score > m0, 'une bonne session proche ici fait monter la note');
ok(scoreSlot(mid, withS([sess(1, sameMid)])).score < m0, 'une mauvaise session proche ici fait baisser la note');
ok(scoreSlot(mid, withS([sess(5, sameMid), sess(5, sameMid), sess(5, sameMid)])).score > scoreSlot(mid, withS([sess(5, sameMid)])).score, 'trois bonnes sessions pèsent plus qu\'une');
ok(scoreSlot(mid, withS([sess(5, sameMid), sess(5, sameMid), sess(5, sameMid), sess(5, sameMid)])).score - m0 <= 1.6, 'la mémoire ne déplace pas la note de plus de 1,5 point');
ok(scoreSlot(mid, withS([sess(5, sameMid, 'autre-spot')])).score === m0, 'une session sur un AUTRE spot ne change rien');
ok(scoreSlot(mid, withS([sess(5, sameMid, 'autre-spot')])).similarSession === null, 'une session sur un autre spot n\'est jamais citée');
ok(scoreSlot(perfect, withS([sess(5)])).similarSession !== null, 'rappel dès la première bonne session proche');
const remind = list => scoreSlot(perfect, withS(list)).whyGood.find(t => /ces conditions ici/.test(t)) || '';
ok(/tu avais adoré/.test(remind([sess(5)])), 'rappel d\'une session 5 étoiles : « tu avais adoré »');
ok(/bonne session/.test(remind([sess(4)])), 'rappel d\'une session 4 étoiles : « une bonne session »');
ok(/2 fois/.test(remind([sess(5), sess(4)])), 'plusieurs bonnes sessions : on dit combien de fois');
ok(/« Glassy, personne à l\'eau »/.test(remind([{ ...sess(5), notes: 'Glassy, personne à l\'eau' }])), 'le rappel reprend la note du surfeur');
ok(!/\d{4}|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre/.test(remind([sess(5)]) + remind([sess(5), sess(4)])), 'le rappel ne cite jamais de date');
ok(scoreSlot(perfect, withS([sess(5, { waveHeight: 0.6, swellHeight: 0.6 })])).similarSession === null, 'taille trop différente : pas de rappel');
ok(scoreSlot(perfect, withS([sess(5, { tideLevel: 0.9 })])).memory.similarCount === 0 || scoreSlot(perfect, withS([sess(5, { tideLevel: 0.9 })])).memory.adjustment < scoreSlot(perfect, withS([sess(5)])).memory.adjustment, 'marée opposée : ressemblance plus faible');
ok(scoreSlot(perfect, withS([sess(5, { windDirection: 270, windSpeed: 15 })])).memory.adjustment < scoreSlot({ ...perfect, windSpeed: 15 }, withS([sess(5, { windSpeed: 15 })])).memory.adjustment, 'vent de direction opposée : ressemblance plus faible');
ok(scoreSlot(mid, withS([sess(1, sameMid)])).whyNotPerfect.some(t => /ne t'avait pas plu/.test(t)), 'mauvaise session proche : signalée en point d\'attention');
ok(scoreSlot({ ...perfect, waveHeight: 5, swellHeight: 5 }, withS([sess(5, { waveHeight: 5, swellHeight: 5 })])).score < 4, 'la mémoire ne sauve pas un créneau hors de la fourchette');
ok(r0.score >= 8.5, 'sans session, le socle seul note toujours');

// Vent : tolérance selon le niveau, puis apprise
const lvl = l => learnWindTolerance([], { surf_level: l }).scale;
ok(lvl('beginner') < lvl('intermediate') && lvl('intermediate') < lvl('advanced'), 'un débutant tolère moins de vent qu\'un confirmé');
const onshore20 = { ...perfect, windSpeed: 20, windDirection: 280 };
ok(scoreSlot(onshore20, { ...ctx, profile: { ...profile, surf_level: 'beginner' } }).score < scoreSlot(onshore20, { ...ctx, profile: { ...profile, surf_level: 'advanced' } }).score, '20 km/h de mer : moins bien noté pour un débutant');
const windS = (speed, feel, dir = 280) => ({ rating: 3, spot_id: 'x', date: days(10), meteo: { waveHeight: 1.2, windSpeed: speed, windDirection: dir, waveDirection: 280, wavePeriod: 9, windFeel: feel } });
const sensitive = learnWindTolerance([windS(12, 'annoying'), windS(14, 'too_much'), windS(13, 'annoying'), windS(6, 'clean'), windS(15, 'too_much'), windS(11, 'annoying'), windS(5, 'clean'), windS(16, 'too_much'), windS(12, 'annoying'), windS(7, 'clean')], profile);
ok(sensitive.source === 'learned' && sensitive.scale < 20, `gêné dès 12 km/h : tolérance abaissée (échelle ${sensitive.scale})`);
const tough = learnWindTolerance(Array.from({ length: 10 }, (_, i) => windS(22 + i, 'clean')), profile);
ok(tough.scale > 30, `propre jusqu'à 31 km/h : tolérance relevée (échelle ${tough.scale})`);
ok(learnWindTolerance([windS(30, 'clean', 100), windS(32, 'clean', 100), windS(35, 'clean', 100)], profile).source === 'level', 'un vent de terre ne dit rien de la tolérance au vent de mer');
ok(learnWindTolerance([windS(12, 'annoying'), windS(6, 'clean')], profile).source === 'level', 'moins de trois ressentis : on reste sur le niveau');
ok(scoreSlot({ ...perfect, windSpeed: 15, windDirection: 280 }, withS([windS(12, 'annoying'), windS(14, 'too_much'), windS(13, 'annoying'), windS(6, 'clean'), windS(15, 'too_much'), windS(11, 'annoying'), windS(5, 'clean'), windS(16, 'too_much'), windS(12, 'annoying'), windS(7, 'clean')])).score < scoreSlot({ ...perfect, windSpeed: 15, windDirection: 280 }, ctx).score, 'un surfeur sensible au vent voit sa note baisser à 15 km/h de mer');

// Progression : les sessions récentes déplacent la fourchette
const old = Array.from({ length: 10 }, () => ({ rating: 4, date: days(900), meteo: { waveHeight: 0.8, windSpeed: 10, wavePeriod: 9, sizeFeel: 'perfect' } }));
const recent = Array.from({ length: 10 }, () => ({ rating: 4, date: days(20), meteo: { waveHeight: 1.6, windSpeed: 10, wavePeriod: 9, sizeFeel: 'perfect' } }));
const prog = learnWaveRange([...old, ...recent], profile);
ok(prog.max >= 1.5 && learnWaveRange(old, profile).max < prog.max, `la fourchette monte avec les sessions récentes (obtenu ${prog.min}-${prog.max})`);

// 9. Sessions : formats anciens ramenés au format du moteur
ok(normalizeSession({ meteo: { windSpeed: 5, airTemperature: 15, waveHeight: 1 } }).meteo.windSpeed === 18, 'format brut : m/s → km/h');
const text = JSON.stringify({ waveHeight: 0.7, windSpeed: 3, airTemperature: 15 });
const broken = {}; [...text].forEach((c, i) => { broken[i] = c; });
ok(normalizeSession({ meteo: broken }).meteo.waveHeight === 0.7, 'météo éclatée reconstituée');
ok(normalizeSession({ meteo: { windSpeed: 12.5, waveHeight: 1, swellHeight: 1 } }).meteo.windSpeed === 12.5, 'format récent inchangé');

// 3. Heure locale et nuit
const tz = spotTimeZone(43.48, -1.56);
ok(tz === 'Europe/Paris', 'fuseau de Biarritz');
ok(localParts('2026-11-16T16:00:00Z', tz).hour === 17, '16h UTC = 17h à Biarritz en hiver');
ok(localParts('2026-07-16T16:00:00Z', tz).hour === 18, '16h UTC = 18h à Biarritz en été');
const sun = sunTimes('2026-11-16', 43.48, -1.56);
ok(!isDaylightSlot(Date.parse('2026-11-16T19:00:00Z'), sun), '20h locales en novembre = nuit');
ok(isDaylightSlot(Date.parse('2026-11-16T10:00:00Z'), sun), '11h locales = jour');

// Recommandation : aucun créneau de nuit, heures locales
const start = Date.now() + 86400000; const day0 = new Date(start); day0.setUTCHours(0, 0, 0, 0);
const forecast = Array.from({ length: 48 }, (_, i) => ({ ...perfect, time: new Date(day0.getTime() + i * 3600000).toISOString(), timestamp: day0.getTime() / 1000 + i * 3600 }));
const res = getBestWindows({ ...ctx, forecast }, 10);
ok(res.windows.length > 0, 'des créneaux sont proposés');
ok(res.hourlyScores.every(h => { const s = sunTimes(h.date, spot.lat, spot.lng); return isDaylightSlot(Date.parse(h.time), s); }), 'aucune heure de nuit');
ok(res.hourlyScores.every(h => h.hour === localParts(h.time, tz).hour), 'heures affichées = heures locales du spot');

// Fourchette apprise
const mk = (h, extra) => ({ rating: 3, date: '2026-05-01', meteo: { waveHeight: h, windSpeed: 10, wavePeriod: 9 }, ...extra });
const feel = (h, f) => mk(h, { meteo: { waveHeight: h, windSpeed: 10, wavePeriod: 9, sizeFeel: f } });
ok(learnWaveRange([], profile).source === 'declared', 'sans session : fourchette du profil');
ok(learnWaveRange([feel(1.2, 'perfect'), feel(1.3, 'perfect')], profile).source === 'declared', 'trop peu de sessions : fourchette du profil');
const small = Array.from({ length: 15 }, (_, i) => feel(0.5 + (i % 5) * 0.1, 'perfect')); // surfeur qui aime 0,5 à 0,9 m
const lr = learnWaveRange(small, profile);
ok(lr.source === 'learned' && lr.max <= 1.0 && lr.min <= 0.6, `débutant petites vagues : fourchette apprise ${lr.min}-${lr.max}`);
ok(score({ ...perfect, waveHeight: 0.7, swellHeight: 0.7 }, { ...ctx, pastSessions: small }) > score({ ...perfect, waveHeight: 0.7, swellHeight: 0.7 }), '0,7 m mieux noté pour qui aime les petites vagues');
ok(score({ ...perfect, waveHeight: 1.9, swellHeight: 1.9 }, { ...ctx, pastSessions: small }) < score({ ...perfect, waveHeight: 1.9, swellHeight: 1.9 }), '1,9 m moins bien noté pour qui aime les petites vagues');
const withBig = [...Array.from({ length: 8 }, (_, i) => feel(1.0 + i * 0.1, 'perfect')), feel(1.6, 'too_big'), feel(1.7, 'too_big'), feel(0.6, 'too_small')];
const lr2 = learnWaveRange(withBig, profile);
ok(lr2.max < profile.max_wave_height, `« trop gros » à 1,6 m abaisse le maxi (obtenu ${lr2.max})`);
ok(lr2.min >= 0.7, `« trop petit » à 0,6 m remonte le mini (obtenu ${lr2.min})`);
const few = learnWaveRange([feel(1, 'perfect'), feel(1, 'perfect'), feel(1, 'perfect'), feel(1, 'perfect'), feel(1, 'perfect')], profile);
ok(few.confidence < 0.5 && few.max > 1.5, 'cinq sessions : on ne bascule que partiellement vers l\'appris');
ok(learnWaveRange([mk(1.5, { rating: 5 }), mk(1.4, { rating: 4 }), mk(1.6, { rating: 5 }), mk(1.2, { rating: 4 }), mk(1.5, { rating: 5 })], profile).source === 'learned', 'sans ressenti, les sessions 4 et 5 étoiles comptent');

// Score toujours borné, jamais NaN
[{}, { waveHeight: 0, windSpeed: 80 }, { waveHeight: 1.5 }, { windSpeed: null, waveHeight: null }].forEach(sl => {
  const sc = score(sl); ok(typeof sc === 'number' && !Number.isNaN(sc) && sc >= 0 && sc <= 10, `score borné pour ${JSON.stringify(sl)}, obtenu ${sc}`);
});

// 9. Rafales, tempête, houle courte, désaccord des sources (leçon du 21/11/2026 : 8,6 un jour de tempête)
const { mergePoint, agreement, countsForLearning } = require('../src/services/collector');
ok(score({ ...perfect, windGust: 20 }) === score(perfect), 'des rafales faibles ne changent rien');
ok(score({ ...perfect, windGust: 45 }) < 5, `rafales à 45 km/h : la note doit passer sous 5, obtenu ${score({ ...perfect, windGust: 45 })}`);
[25, 35, 45, 55, 70].reduce((prev, g) => { const v = score({ ...perfect, windGust: g }); ok(v <= prev, `rafales ${g} km/h ne doivent pas remonter la note`); return v; }, 10);
ok(scoreSlot({ ...perfect, windGust: 55 }, ctx).storm === true && score({ ...perfect, windGust: 55 }) <= 2.5, 'rafales à 55 km/h = tempête, jamais recommandée');
ok(scoreSlot({ ...perfect, waveHeight: 3.8, swellHeight: 3.6, windSpeed: 35 }, ctx).storm === true, 'grosse mer et vent fort = tempête');
ok(score({ ...perfect, swellPeriod: 8, wavePeriod: 8 }) <= 7.9, 'houle de 8 s : jamais exceptionnel');
ok(score({ ...perfect, swellPeriod: 6, wavePeriod: 6 }) <= 6.4, 'houle de 6 s : plafonnée');
ok(score({ ...perfect, confidence: 'low' }) <= 6.9, 'sources en désaccord : pas de note exceptionnelle');
ok(score({ ...perfect, windWaveHeight: 1.0 }) < score(perfect), 'une forte mer du vent fait baisser la note');
ok(scoreSlot({ ...perfect, windGust: 45 }, ctx).whyNotPerfect.some(t => /Rafales/.test(t)), 'les rafales sont dites à l\'utilisateur');
const merged = mergePoint({ waveHeight: 2.4, windSpeed: 14.5, windDirection: 112, wavePeriod: 8 }, { waveHeight: 1.8, windSpeed: 23, windGust: 44, windDirection: 178, swellPeriod: 10 });
ok(merged.windSpeed === 23 && merged.windDirection === 178 && merged.windGust === 44, 'vent : on retient le plus fort des deux avis, avec ses rafales');
ok(merged.waveHeight === 2.1, 'vagues : moyenne des deux avis');
ok(agreement({ waveHeight: 2.4, windSpeed: 5 }, { waveHeight: 1.0, windSpeed: 25 }) === 'low', 'gros écart entre les sources = confiance basse');
ok(agreement({ waveHeight: 1.5, windSpeed: 10 }, { waveHeight: 1.4, windSpeed: 12 }) === 'high', 'sources proches = confiance haute');
ok(mergePoint({ waveHeight: 1.5, windSpeed: 10 }, null).confidence === 'single', 'une seule source : on le sait');
// Les sessions d'exemple (antérieures au 21/11/2026) ne nourrissent pas le moteur
ok(countsForLearning({ created_at: '2026-05-10T10:00:00Z' }) === false, 'session d\'exemple ignorée');
ok(countsForLearning({ created_at: '2026-11-22T10:00:00Z' }) === true, 'vraie session prise en compte');

console.log(`✅ ${n} vérifications du moteur passent`);
