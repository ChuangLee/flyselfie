// Candidate comparison within one task boundary (FE-10). Values come only from
// docs/16-project-requirements-en.md; everything else is explicitly unknown.
// kind: fact (stated in requirements) | unknown | pending | na

export const CANDIDATES = [
  { id: 'L1', product: 'mechanical', zh: 'L1 手摇纯机械', en: 'L1 hand-cranked mechanical', status: { zh: '有限 D1（R1+R2）', en: 'Limited D1 (R1 + R2)' } },
  { id: 'P-010', product: 'mechanical', zh: 'P-010/P-020 被动弹簧收放 + 机械方向感知', en: 'P-010/P-020 passive spring + mechanical direction sensing', status: { zh: '原理分析；未制造、未实测', en: 'Principle analysis; not built or tested' } },
  { id: 'E-100', product: 'electronic', zh: 'E-100…E-130 背包侧电子控制', en: 'E-100…E-130 backpack-side electronic control', status: { zh: '研究阶段；制造设计与 D1 未完成', en: 'Research; manufacturing design and D1 incomplete' } },
];

const U = { kind: 'unknown' };
const fact = (zh, en) => ({ kind: 'fact', zh, en });
const pend = (zh, en) => ({ kind: 'pending', zh, en });

export const COMPARE_ROWS = [
  { zh: '控制能量链', en: 'Control energy chain', v: {
    L1: fact('人工/机械，无电子程序', 'Manual / mechanical, no electronic program'),
    'P-010': fact('弹簧储能 + 机械（原理）', 'Spring storage + mechanical (principle)'),
    'E-100': fact('电机/电子制动或离合（比较中）', 'Motor / electronic brake or clutch (under comparison)') } },
  { zh: '起飞', en: 'Launch', v: { L1: fact('人工', 'Manual'), 'P-010': U, 'E-100': U } },
  { zh: '放线', en: 'Payout', v: { L1: fact('人工', 'Manual'), 'P-010': pend('被动弹簧（原理）', 'Passive spring (principle)'), 'E-100': pend('主动/制动（比较中）', 'Active / braked (under comparison)') } },
  { zh: '回收', en: 'Retrieval', v: { L1: fact('手摇', 'Hand crank'), 'P-010': pend('弹簧回卷（原理）', 'Spring rewind (principle)'), 'E-100': pend('电机回卷（比较中）', 'Motor rewind (under comparison)') } },
  { zh: '交接/锁定/收纳', en: 'Handover / lock / stowage', v: { L1: fact('停止后人工整理', 'Manual arrangement after stopping'), 'P-010': U, 'E-100': U } },
  { zh: '空中/飞行状态判别', en: 'Airborne / grounded state sensing', v: { L1: U, 'P-010': pend('张力+方向，存在歧义（MC-04）', 'Tension + direction, ambiguous (MC-04)'), 'E-100': pend('信号缺失应为未知态（EC-03）', 'Missing signal must yield unknown state (EC-03)') } },
  { zh: '总携带质量', en: 'Total carried mass', v: { L1: fact('估计 3.0–3.4 kg（待称重）', 'Est. 3.0–3.4 kg (to be weighed)'), 'P-010': U, 'E-100': U } },
  { zh: '空中质量', en: 'Airborne mass', v: { L1: fact('设计上限 340 g', 'Design ceiling 340 g'), 'P-010': U, 'E-100': fact('轻量空中端为研究基线', 'Lightweight airborne end is research baseline') } },
  { zh: '最大外露系绳', en: 'Max external tether', v: { L1: fact('2.5 m', '2.5 m'), 'P-010': U, 'E-100': U } },
  { zh: '断电后果', en: 'Power-loss consequence', v: { L1: { kind: 'na', zh: '不适用（无电源控制）', en: 'n/a (no powered control)' }, 'P-010': { kind: 'na', zh: '不适用', en: 'n/a' }, 'E-100': pend('无动态模型（EC-05）', 'No dynamic model (EC-05)') } },
  { zh: '本环境中的动态模型', en: 'Dynamic model in this environment', v: {
    L1: pend('占位质点模型（参数未导入 L1）', 'Placeholder point-mass model (L1 parameters not imported)'),
    'P-010': pend('无', 'None'), 'E-100': pend('无；L1 模型不得代用', 'None; L1 model must not substitute') } },
  { zh: '实物测试', en: 'Physical tests', v: { L1: fact('NOT_RUN（M-070）', 'NOT_RUN (M-070)'), 'P-010': fact('NOT_RUN', 'NOT_RUN'), 'E-100': fact('NOT_RUN', 'NOT_RUN') } },
];
