/**
 * Bone mass through life: a teaching model of femoral-neck bone mineral density (BMD) from childhood
 * to old age, with the factors that move it, the T-score against young adults and the WHO
 * categories.
 *
 * - Reference: NHANES III femoral neck, young (20–29) white women 0.858 ± 0.120 g/cm², men
 *   0.934 ± 0.137 g/cm² (Looker et al., Osteoporos Int 1998;8:468–489). T-scores for both sexes use
 *   the young-women reference (ISCD official positions, 2019).
 * - Peak bone mass is reached by about 30; after 40 both sexes lose about 0.5 %/year; women lose
 *   about 2 %/year for 5–7 years after the menopause, then about 0.8 %/year (Riggs & Melton, N Engl J
 *   Med 1986;314:1676; Recker et al., J Bone Miner Res 2000;15:1965).
 * - Glucocorticoids: rapid loss in the first months (Van Staa et al., Osteoporos Int 2002;13:777).
 * - Hip-fracture risk rises about 2.6-fold for each SD lower at the femoral neck (Marshall et al., BMJ
 *   1996;312:1254).
 */

export type Sex = 'female' | 'male';
export interface BoneFactors {
  /** Weight-bearing exercise in youth (raises peak bone mass). */
  activeYouth: boolean;
  /** Low calcium and vitamin D (lowers peak, speeds later loss). */
  lowCalcium: boolean;
  smoker: boolean;
  /** Long-term oral glucocorticoids from this age (or null). */
  steroidsFrom: number | null;
  /** Women: age at the menopause, and hormone therapy for 5 years from it. */
  menopause: number;
  hrt: boolean;
}
export const DEFAULT_FACTORS: BoneFactors = { activeYouth: false, lowCalcium: false, smoker: false, steroidsFrom: null, menopause: 51, hrt: false };

export const YOUNG = { female: { mean: 0.858, sd: 0.12 }, male: { mean: 0.934, sd: 0.137 } } as const;

const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** Femoral-neck BMD (g/cm²) at an age, for a sex and set of factors. */
export function bmdAt(age: number, sex: Sex, f: BoneFactors = DEFAULT_FACTORS): number {
  let peak: number = YOUNG[sex].mean;
  if (f.activeYouth) peak *= 1.05;
  if (f.lowCalcium) peak *= 0.95;
  // Childhood and puberty: from about 45 % of peak at 5 to the peak by about 25 (most of it in the
  // years around puberty, which come about two years earlier in girls).
  const pubertyMid = sex === 'female' ? 13 : 15;
  if (age < 30) return peak * (0.45 + 0.55 * (0.25 * smooth((age - 2) / 20) + 0.75 * smooth((age - pubertyMid + 4) / 9)));
  // Yearly losses after the peak, integrated year by year.
  let v = peak;
  for (let y = 30; y < age; y++) {
    const dt = Math.min(1, age - y);
    let loss = y >= 40 ? 0.005 : 0;
    if (sex === 'female' && y >= f.menopause) {
      const since = y - f.menopause;
      loss = since < 6 ? 0.02 : 0.008;
      if (f.hrt && since < 5) loss = 0.003;
    }
    if (f.lowCalcium && y >= 40) loss += 0.002;
    if (f.smoker) loss += 0.002;
    if (f.steroidsFrom !== null && y >= f.steroidsFrom) loss += y - f.steroidsFrom < 1 ? 0.03 : 0.01;
    v *= 1 - loss * dt;
  }
  return v;
}

export const tScore = (bmd: number) => (bmd - YOUNG.female.mean) / YOUNG.female.sd;

export type Category = 'normal' | 'osteopenia' | 'osteoporosis';
/** WHO (1994) categories by T-score. */
export const category = (t: number): Category => (t >= -1 ? 'normal' : t > -2.5 ? 'osteopenia' : 'osteoporosis');
export const CATEGORY_TEXT: Record<Category, string> = {
  normal: 'Normal (T-score −1 or above).',
  osteopenia: 'Low bone mass, osteopenia (T-score between −1 and −2.5).',
  osteoporosis: 'Osteoporosis (T-score −2.5 or below): treatment is usually advised, and a fragility fracture at this level counts as severe osteoporosis.',
};

/** Hip-fracture risk relative to a T-score of 0 (2.6-fold per SD). */
export const hipRiskRelative = (t: number) => 2.6 ** Math.max(0, -t);

/** BMD over a life, for the chart. */
export function curve(sex: Sex, f: BoneFactors, from = 5, to = 90, step = 1): { age: number; bmd: number }[] {
  const out = [];
  for (let a = from; a <= to; a += step) out.push({ age: a, bmd: bmdAt(a, sex, f) });
  return out;
}

/** The remodelling cycle of one basic multicellular unit (BMU), in days from activation. */
export const BMU_PHASES = [
  { id: 'activation', label: 'Activation', from: 0, to: 3, text: 'Osteocytes sense damage or disuse and signal (less sclerostin, more RANKL); osteoclast precursors from the blood fuse on the surface.' },
  { id: 'resorption', label: 'Resorption', from: 3, to: 24, text: 'Osteoclasts seal onto the bone and dissolve it with acid and cathepsin K, digging a cutting cone (cortex) or a pit (trabecula) about 3 weeks long.' },
  { id: 'reversal', label: 'Reversal', from: 24, to: 34, text: 'Osteoclasts die by apoptosis; reversal cells clean the floor and lay a cement line.' },
  { id: 'formation', label: 'Formation', from: 34, to: 130, text: 'Osteoblasts lay down osteoid (collagen type I) that mineralises with hydroxyapatite over weeks; some become trapped as osteocytes, the rest flatten into lining cells.' },
  { id: 'quiescence', label: 'Rest', from: 130, to: 160, text: 'The surface rests under lining cells until the next cycle. About 10 % of the skeleton is renewed each year (cortical bone about 3 %, trabecular bone about 25 %).' },
] as const;
export const bmuPhaseAt = (day: number) => BMU_PHASES.find((p) => day >= p.from && day < p.to) ?? BMU_PHASES[BMU_PHASES.length - 1]!;
