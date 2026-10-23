#!/usr/bin/env python3
"""Assemble concepts.json from the calc_*.py results (run those first). Scores/judgements are
analyst estimates, not test results. Nothing here is physical verification."""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
B = json.load(open(os.path.join(HERE, "results_boom.json")))
I = json.load(open(os.path.join(HERE, "results_imaging.json")))
BD = json.load(open(os.path.join(HERE, "results_body.json")))
S = json.load(open(os.path.join(HERE, "results_snow.json")))
ISO = json.load(open(os.path.join(HERE, "results_isolation.json")))


def boom(name, L):
    return next(c for c in B["cases"] if c["name"] == name and abs(c["L_m"] - L) < 1e-6)


def body(case):
    return next(r for r in BD["rows"] if r["case"] == case)


def view(prefix):
    return next(v for v in I["views"] if v["name"].startswith(prefix))


def kn(value, unit, source, ref):
    return {"value": value, "unit": unit, "source": source, "ref": ref}


def sc(score, why):
    return {"score": score, "why": why}


def vp(az, el, d, notes):
    return {"azimuth": az, "elevation_deg": el, "distance_m": d, "notes": notes}


PA = {
    "insta_pole": {"name": "Insta360 Ski Pole Mount (14-22 mm poles; not advised for freestyle/very high speed)",
                   "url": "https://store.insta360.com/product/ski-pole-mount", "relevance": "existing pole-borne invisible-stick product"},
    "insta_pole_news": {"name": "Insta360 ski pole mount launch note", "url": "https://insta360.com/blog/news/insta360-ski-pole-mount-available-now.html",
                        "relevance": "vendor positioning and limits"},
    "gopro_pole": {"name": "GoPro Ski Pole Mount ASKIM-001 + 40in carbon extension pole (MAX series invisible)",
                   "url": "https://www.bhphotovideo.com/c/product/1917698-REG/gopro_askim_001_ski_pole_mount.html", "relevance": "second vendor, same concept, glove knob"},
    "insta_backpack": {"name": "Insta360 Third-Person Backpack Mount (frame + carbon pole + waist straps)",
                       "url": "https://store.insta360.com/product/383", "relevance": "commercial hip/backpack-rooted tail boom, short pole"},
    "ram_3pv": {"name": "RAM Mounts 3rd Person View kit (backpack plate + hip belt + 18in flexible bar)",
                "url": "https://www.24mx.com/en-us/product/ram-r-mounts-3rd-person-view-kit/PM-4925149", "relevance": "hip-belt load path prior art (moto)"},
    "harness_review": {"name": "360rumors review: hands-free third-person harness (camera sways side to side while walking)",
                       "url": "https://360rumors.com/ebay-hands-free-third-person-view-mount-harness-quick-review-sample-360-video/",
                       "relevance": "user evidence of lateral sway on weak booms"},
    "insta_stick": {"name": "Insta360 114 cm invisible selfie stick (118 g, retracted 23 cm; vendors advise <=70 cm at speed)",
                    "url": "https://www.backscatter.com/Insta360-114cm-Invisible-Selfie-Stick", "relevance": "mass/length data and speed caveat"},
    "insta_x4": {"name": "Insta360 X4 product page (8K/5.7K 360, invisible selfie stick effect)",
                 "url": "https://www.insta360.com/product/insta360-x4", "relevance": "imaging resolution basis"},
    "bistable_patent": {"name": "US8770522B1 Deployable space boom using bi-stable tape spring mechanism",
                        "url": "https://patents.google.com/patent/US8770522", "relevance": "bistable tape boom deploys with only a guide"},
    "nasa_ctm": {"name": "NASA Deployable Composite Boom (Bi-CTM, licensed to MMA Design)", "url": "https://technology.nasa.gov/patent/LAR-TOPS-328",
                 "relevance": "closed-section rollable boom, high bending+torsion per mass"},
    "usu_bistable": {"name": "USU SmallSat 2010 bistable tape boom (camera/sensor boom use case)", "url": "https://digitalcommons.usu.edu/smallsat/2010/all2010/58",
                     "relevance": "deterministic unrolling"},
    "kuroiwa": {"name": "Colbeck/Kuroiwa high-speed ski friction (mu 0.03->0.1 for 5->22 m/s)",
                "url": "https://www.cambridge.org/core/journals/annals-of-glaciology/article/an-error-analysis-of-the-techniques-used-in-the-measurement-of-highspeed-friction-on-snow/6031D6310ECAFF743994CDE7264E1DE5",
                "relevance": "sled/robot resistance input"},
    "frontiers_fric": {"name": "Frontiers 2022 ski friction review (0.005-0.035 by snow type)", "url": "https://www.frontiersin.org/articles/10.3389/fspor.2022.844883/pdf",
                       "relevance": "friction range"},
    "gopro_snow": {"name": "GoPro snowboard follow-cam guidance (extension pole)", "url": "https://gopro.com/en/aq/shop/activity/snowboard", "relevance": "vendor follow-cam practice"},
}

b20d = boom("tube OD25x1.2 Emid telescoping+damper", 2.0)
b20 = boom("tube OD25x1.2 Emid telescoping", 2.0)
b20r = boom("tube OD25x1.2 Emid rigid", 2.0)
b16t = boom("tube OD20x1.0 Emid telescoping", 2.0)
bd20 = body("tube OD25x1.2 Emid telescoping+damper L=2.0")
ctm_s = boom("CTM 50x16x0.3 strong-axis(sagittal)", 2.0)
ctm_w = boom("CTM 50x16x0.3 weak-axis(lateral)", 2.0)
bdctm = body("CTM 50x16x0.3 strong-axis(sagittal) L=2.0")
v20 = view("tail boom 2.0 m")
v25 = view("tail boom 2.5 m")
v15 = view("tail boom 1.5 m")
vq = view("rear-quarter")
vm = view("overhead mast")
vh = view("helmet stick")
vp_ = view("ski-pole")
vs = view("towed sled")
vr = view("snow robot")
vd = view("reference drone")
stick20 = next(r for r in I["stick"]["rows"] if r["stick_D_mm"] == 20.0)
stick16 = next(r for r in I["stick"]["rows"] if r["stick_D_mm"] == 16.0)
wv = [w for w in B["weathervane"] if w["L_m"] == 2.0 and w["fin_m2"] == 0.03]
act = {(a["L_m"], a["f_Hz"]): a for a in B["active_yaw"]}
hel = {h["L_m"]: h for h in B["helmet"]}
infl = {(r["r_m"], r["p_Pa"]): r for r in B["inflatable"]}
iso = {(r["f_iso_Hz"], r["zeta"]): r for r in ISO["rows"]}
fall20 = next(f for f in BD["falls"] if f["L_m"] == 2.0)
sled = S["sled"]
rob = S["robot"]
# V-twin CTM truss lateral stiffness (calc inline): two members, root spread s, axial stiffness EA/L
E_ctm, A_ctm = 60e9, 3.3e-5
s_spread, Lv = 0.30, 2.0
sin_t = (s_spread / 2) / Lv
k_lat_truss = 2 * E_ctm * A_ctm / Lv * sin_t ** 2
k_lat_single = 3 * ctm_w["EI_Nm2"] / Lv ** 3
f_lat_truss = math.sqrt(k_lat_truss / 0.25) / (2 * math.pi)

common_states = ["torso 6-DOF pose from a skier kinematic model (turn rhythm, angulation, counter-rotation)",
                 "carrier elastic state", "camera pose", "contact/fuse state"]

concepts = []

concepts.append(dict(
    id="BODY-01", name_zh="伸缩碳管尾臂 + 360 隐形杆", name_en="Telescoping carbon tail boom with 360 'invisible stick'",
    lens="body", one_liner="髋带框架根部，2 m 锥形伸缩碳管向后上 30° 伸出，端部 360 相机，隐形杆效果 + 自动重构图。",
    principle="把相机位置刚性约束在身体坐标系里；360 相机负责旋转稳定与取景，杆落在双鱼眼拼接缝的‘盲区平板’内被抹去。",
    architecture=dict(carrier="4–5 节锥形碳管（根 OD25/壁1.2 → 端 OD16），粘弹阻尼根座", support="背负框架+髋带（类登山包腰带）传递弯矩到骨盆",
                      energy="无（相机自带电池）", sensing="相机 IMU/陀螺；可选：根部弯矩应变片做摔倒检测",
                      imaging="360 相机（5.7K/8K 等距柱状），后期/机内 AI 追踪重构图", use_flow="停止→从包侧抽出→逐节拉开锁止→插入根座→开录；乘缆车前必须收回"),
    viewpoints=[vp("rear (0°±15°)", v20["elevation_deg"], v20["distance_to_centre_m"], "身体锁定视角：人物在画面中几乎静止、背景摆动"),
                vp("rear-quarter 40°（偏置根座）", vq["elevation_deg"], vq["distance_to_centre_m"], "不对称载荷，需另评")],
    key_numbers={
        "boom_f1_telescoping": kn(b20["f1_Hz"], "Hz", "calc", "calc_boom.py OD25x1.2 L2.0, joint knockdown 0.6"),
        "boom_f1_rigid_one_piece": kn(b20r["f1_Hz"], "Hz", "calc", "calc_boom.py"),
        "mogul_band": kn("1–3", "Hz", "assumed", "mogul spacing 4–8 m at 8–15 m/s"),
        "tip_rel_motion_mogul_undamped": kn(b20["mogul_rel_tip_amp_mm"], "mm", "calc", "SDOF base excitation 0.5 g, ζ=0.02 (worst case sinusoid)"),
        "tip_rel_motion_mogul_damped": kn(b20d["mogul_rel_tip_amp_mm"], "mm", "calc", "ζ=0.15 root damper"),
        "tip_ang_rate_damped": kn(b20d["tip_ang_rate_amp_dps"], "deg/s", "calc", "removed by 360 gyro stabilisation; translation remains"),
        "sag_at_turn_loadfactor_1.8g": kn(b20["sag_turn_mm"], "mm", "calc", "协调转弯时载荷在身体系内沿躯干轴 → 主要是矢状面弯曲"),
        "root_moment_turn_quasistatic": kn(b20["root_moment_turn_Nm"], "N·m", "calc", ""),
        "root_moment_operating_peak": kn(bd20["root_moment_operating_peak_Nm"], "N·m", "calc", "×2 dynamic factor assumed"),
        "breakaway_fuse": kn(bd20["breakaway_fuse_setting_Nm"], "N·m", "calc", "1.5× operating peak; failure moment " + str(bd20["boom_failure_moment_Nm"]) + " N·m"),
        "system_mass": kn(bd20["system_mass_kg"], "kg", "calc+assumed", "boom+camera 0.2+root hardware 0.35"),
        "yaw_inertia_added": kn(b20["I_yaw_added_kgm2"], "kg·m²", "calc", f"= +{bd20['yaw_I_added_pct'][1]}–{bd20['yaw_I_added_pct'][0]}% of whole-body yaw 1–2 kg·m²"),
        "yaw_torque_to_follow_heading_1Hz_turns": kn(act[(2.0, 1.0)]["peak_torque_Nm"], "N·m", "calc", "±45° heading swing at 1 Hz short turns; 0.5 Hz → " + str(act[(2.0, 0.5)]["peak_torque_Nm"])),
        "roll_inertia_added": kn(b20["I_roll_added_kgm2"], "kg·m²", "calc", f"+{bd20['roll_I_added_pct'][1]}–{bd20['roll_I_added_pct'][0]}% of 10–15 kg·m² about feet"),
        "drag_15ms": kn(b20["drag_15ms_N"], "N", "calc", f"{bd20['boom_drag_pct_of_skier'][1]}–{bd20['boom_drag_pct_of_skier'][0]}% of skier drag"),
        "body_subtends": kn(v20["body_subtends_deg"], "deg", "calc", "1.75 m skier, camera 2.07 m from body centre"),
        "body_px_5.7K_native": kn(v20["body_px_native_5.7K"], "px", "calc", "5760/360 = 16 px/deg; 90° crop = 1440 px wide"),
        "body_px_drone_10m_for_comparison": kn(vd["body_px_native_5.7K"], "px", "calc", "reference drone follow 10 m, same 360 sensor"),
        "perspective_head_feet_scale": kn(v20["head_vs_feet_scale_ratio"], "ratio", "calc", "1.0 = no distortion; drone ≈1.06"),
        "stick_hidden_condition": kn(f"D<b; tip OD16 → margin {stick16['slab_margin_mm']} mm, tilt ≤{stick16['max_tilt_deg_hidden_to_r2.0m']}° over 2 m", "-", "calc+assumed", "b=30 mm lens baseline assumed"),
        "tip_KE_15ms": kn(bd20["KE_tip_hardware_15ms_J"], "J", "calc", "boom+camera hitting another person"),
        "lean_back_to_tip_contact": kn(fall20["lean_back_deg_at_tip_contact"], "deg", "calc", "后仰摔倒时杆尖先触雪 → 杠杆进腰带"),
        "deploy_stow_time": kn("15–25 / 10–20", "s", "assumed", "4–5 sections with gloves"),
        "packed_length": kn("0.5–0.6", "m", "assumed", "114 cm Insta360 stick retracts to 23 cm (lit)"),
    },
    scores=dict(
        footage=sc(3, "全身+环境、分辨率高于远距航拍（654 px vs 153 px），但只有后方、身体锁定视角、近距透视（头脚比 1.5），看不到脸"),
        interference=sc(3, "质量<1 kg、阻力<5%，但偏航惯量 +46–92%，短弯 1 Hz 需额外 ~25 N·m 偏航力矩；后仰时杆尖先触雪"),
        convenience=sc(3, "无电子件，但每次上缆车都要收，手套下 4–5 节锁扣慢"),
        safety=sc(3, "必须有磁吸/弹性折断保险（~33 N·m）；杆尖 ~60 J 打人；树枝/缆车勾挂"),
        simplicity=sc(4, "被动、零件少；主要失效：节间松动、根座磨损、低温卡锁")),
    bold_hypothesis="后方 2–2.5 m 的身体锁定 360 视角，经 AI 重构图后，大多数休闲滑雪者认为‘足够像跟拍’，且其分辨率优于 10 m 航拍。",
    falsification_test="① 现成 Insta360 隐形杆 + 背包支架加长到 2 m，在初级道/中级道各 10 趟，测加速度计根部谱与相机轨迹；② 盲评：与同伴手持跟拍对比，若 ≥60% 评分者认为明显差则否；③ 偏航：受试者短弯节奏、误差主观评分 有/无杆 对比，若节奏下降 >10% 则干扰不可接受。",
    kill_criteria=["实测阻尼后杆尖平移 RMS > 30 mm（主体在画面中跳动 >0.8°）", "受试者在 1 Hz 短弯中节奏/稳定性显著下降", "滑雪场明令禁止背后突出物", "折断保险无法同时满足：正常不脱（≥25 N·m）且后仰摔倒时可靠脱开"],
    sim_plan=dict(what_to_model="多段 Euler-Bernoulli/有限元柔性梁（5–10 段，节间转动弹簧=伸缩接头柔度），根部粘弹阻尼+折断保险（力矩阈值铰），安装在由滑雪者运动学驱动的躯干刚体上；端部质量=相机；360 投影及拼缝盲区平板可视化",
                  states=common_states + ["beam modal coords", "fuse latched/broken", "stick visible in seam?"],
                  scenarios=["中级道 carving 0.5 Hz 转弯 15 m/s", "1 Hz 短弯", "猫跳 1–3 Hz 0.5 g 竖向", "刃颤 5–30 Hz", "后仰摔倒压杆", "左侧摔倒滚翻", "树枝勾挂杆尖", "缆车上车（收纳检查）", "他人从侧后超车接近"],
                  metrics=["杆尖平移 RMS/峰值 (mm)", "相机角速度 (°/s) 与陀螺补偿后残余", "主体像素高度与画面占比", "隐形杆是否露出（帧比例）", "根部弯矩时程与保险触发", "附加偏航力矩 (N·m)", "可用画面比例"]),
    prior_art=[PA["insta_backpack"], PA["ram_3pv"], PA["harness_review"], PA["insta_stick"], PA["insta_x4"]]))

concepts.append(dict(
    id="BODY-02", name_zh="双稳态复合卷带 V 形双尾臂", name_en="Bistable composite tape-spring V-twin boom (reel-deployed)",
    lens="body", one_liner="背包内两卷双稳态碳纤维闭口卷带（CTM），按键 2–4 s 伸出成 V 形桁架，在杆尖汇合挂 360 相机；摔倒/上缆车自动收卷。",
    principle="卷带展开后形成闭口截面，主轴放在矢状面承担沿躯干轴的转弯载荷；两根在根部分开 0.3 m 形成三角桁架，以轴向刚度换侧向刚度；卷带过载局部折皱即‘天然保险’并可弹性恢复。",
    architecture=dict(carrier="2× CTM 卷带 50×16×0.3 mm（展平宽 ~110 mm），汇合头含相机快拆", support="背包框架+髋带；左右两卷筒间距 0.3 m",
                      energy="小电机卷收（或弹簧储能展开+手摇收），~10 Wh 足够", sensing="IMU 摔倒检测→自动收卷；卷筒编码器", imaging="360 相机；V 形两根均在拼缝平面内（需验证）",
                      use_flow="按键展开→滑→按键/自动收→上缆车"),
    viewpoints=[vp("rear", v20["elevation_deg"], v20["distance_to_centre_m"], "同 BODY-01；可在 1.5–2.5 m 间实时伸缩改变构图（‘伸缩推拉镜头’）"),
                vp("rear-high", v25["elevation_deg"], v25["distance_to_centre_m"], "2.5 m 伸出")],
    key_numbers={
        "single_CTM_f1_strong_axis_2m": kn(ctm_s["f1_Hz"], "Hz", "calc", "E_eff 60 GPa thin elliptical section"),
        "single_CTM_f1_weak_axis_2m": kn(ctm_w["f1_Hz"], "Hz", "calc", "单根侧向太软 → 需 V 形"),
        "lateral_stiffness_single": kn(round(k_lat_single, 1), "N/m", "calc", ""),
        "lateral_stiffness_V_truss": kn(round(k_lat_truss), "N/m", "calc", "2·EA/L·sin²θ, root spread 0.3 m"),
        "lateral_f1_V_truss_upper_bound": kn(round(f_lat_truss, 1), "Hz", "calc", "上限：忽略节点/卷筒柔度，实际将低得多"),
        "root_moment_turn": kn(ctm_s["root_moment_turn_Nm"], "N·m", "calc", ""),
        "system_mass": kn(round(bdctm["system_mass_kg"] + 0.35, 2), "kg", "calc+assumed", "+2nd tape, reels, motor 0.35 kg"),
        "yaw_inertia_added": kn(ctm_s["I_yaw_added_kgm2"], "kg·m²", "calc", ""),
        "drag_15ms_two_tapes": kn(round(2 * ctm_w["drag_15ms_N"], 1), "N", "calc", "thin edge to flow when strong axis vertical (approx)"),
        "deploy_time": kn("2–4", "s", "assumed", "~0.7–1 m/s reel speed"),
        "stowed_volume": kn("~1.5", "L", "assumed", "two Ø120 mm reels"),
        "body_px_5.7K_2m": kn(v20["body_px_native_5.7K"], "px", "calc", ""),
        "fold_moment_natural_fuse": kn("≈ 20–40", "N·m", "assumed", "tape-spring local fold; must be measured"),
    },
    scores=dict(
        footage=sc(3, "同尾臂后方视角；可伸缩改变距离增加镜头变化"),
        interference=sc(3, "质量 ~1 kg，偏航惯量同量级；收回快 → 只在想拍时伸出"),
        convenience=sc(4, "按键 2–4 s 伸缩、缆车/排队自动收，手套友好"),
        safety=sc(4, "卷带过载折皱=天然保险，IMU 摔倒触发收卷；仍有杆尖动能"),
        simplicity=sc(3, "卷筒、导向、电机、电池；低温下复合材料卷绕疲劳未知")),
    bold_hypothesis="‘伸出才存在’的摄影臂：把展开/收回做到 <3 s 且自动，能消除尾臂 80% 的使用摩擦（上缆车、排队、摔倒），并让卷带折皱成为可复位保险。",
    falsification_test="① 台架：2 m 自制或采购 CTM 带，-15 °C 冷箱内 500 次卷收，测展开直线度、残余应变与折皱阈值；② 侧向锤击测 V 形实际侧向一阶频率，若 <3 Hz 则否；③ 冷态电池+电机收卷时间。",
    kill_criteria=["V 形实测侧向 f1 < 3 Hz 或扭转太软导致相机滚转 >5°", "-15 °C 下卷绕 200 次内出现分层/裂纹", "折皱阈值离散 >±30%，无法同时做保险和承载", "两根带在 360 拼缝中不能同时隐藏"],
    sim_plan=dict(what_to_model="两根各向异性薄壁梁（强/弱轴不同 EI）+ 汇合节点形成空间桁架；卷筒处出口刚度；过载局部折皱模型（力矩-转角非线性：弹性→平台折皱→回弹）；伸缩长度随时间变化；IMU 触发收卷逻辑",
                  states=common_states + ["deployed length", "tape fold state", "reel motor current"],
                  scenarios=["展开中受侧风/身体转动", "carving 0.5 Hz", "短弯 1 Hz（侧向载荷）", "猫跳", "后仰摔倒→自动收卷时间赛跑", "上缆车自动收", "伸缩推拉镜头"],
                  metrics=["侧向/竖向杆尖位移", "收卷完成时间 vs 着地时间", "折皱触发次数", "画面主体占比随长度变化"]),
    prior_art=[PA["bistable_patent"], PA["nasa_ctm"], PA["usu_bistable"], PA["insta_backpack"]]))

concepts.append(dict(
    id="BODY-03", name_zh="充气尾臂", name_en="Inflatable tail boom",
    lens="body", one_liner="背包内折叠 TPU/织物管，CO₂ 小瓶或电泵充至 1–2 bar 成为 2 m 软臂；碰撞时屈曲变软。",
    principle="膜结构弯曲承载上限由起皱弯矩 M_w = π p r³ / 2 决定；过载起皱即自然泄力。",
    architecture=dict(carrier="Ø70–100 mm 高压织物管（drop-stitch 不适用细长梁）", support="髋带框架", energy=f"充气功 {infl[(0.05, 1e5)]['pump_work_J_per_m']}–{infl[(0.05, 2e5)]['pump_work_J_per_m']} J/m（r=50 mm）",
                      sensing="压力传感器", imaging="360 相机（粗管难以隐藏）", use_flow="充气 30–90 s → 滑 → 泄气卷起"),
    viewpoints=[vp("rear", v20["elevation_deg"], v20["distance_to_centre_m"], "同尾臂")],
    key_numbers={
        "wrinkle_moment_r35_2bar": kn(infl[(0.035, 2e5)]["M_wrinkle_Nm"], "N·m", "calc", "vs operating peak ~19–22 N·m → 不足"),
        "wrinkle_moment_r50_2bar": kn(infl[(0.05, 2e5)]["M_wrinkle_Nm"], "N·m", "calc", "够用但 Ø100 mm"),
        "tube_volume_r50": kn(infl[(0.05, 2e5)]["vol_L_per_m"], "L/m", "calc", ""),
        "pump_work_r50_2bar": kn(infl[(0.05, 2e5)]["pump_work_J_per_m"], "J/m", "calc", "isothermal"),
        "stick_hidden": kn("否 (D≫b=30 mm)", "-", "calc", "calc_imaging slab condition"),
    },
    scores=dict(footage=sc(2, "粗管在 360 中可见、需要遮挡/裁切；同后方视角"),
                interference=sc(3, "质量可低但阻力 ~3–4 倍（Ø100 mm）"),
                convenience=sc(2, "充放气、冷天气压下降（-20 °C 约 -8% 压力）、穿刺"),
                safety=sc(4, "软，碰撞起皱泄力"), simplicity=sc(2, "泵/阀/密封/补气")),
    bold_hypothesis="软臂的安全优势足以抵消粗与慢。", falsification_test="Ø70 mm、2 bar 管 2 m 悬臂端挂 0.2 kg，-10 °C 下测固有频率与起皱弯矩；若起皱 <25 N·m 或 f1<2 Hz 则否。",
    kill_criteria=["起皱弯矩 < 运行峰值", "隐形杆失效导致主体画面被遮挡", "充气时间 >60 s"],
    sim_plan=dict(what_to_model="内压梁：起皱前线性 EI，起皱后铰链式软化；温度-压力耦合", states=common_states + ["internal pressure", "wrinkle state"],
                  scenarios=["carving", "猫跳", "碰撞他人", "降温 20 °C"], metrics=["杆尖位移", "起皱次数", "压力"]),
    prior_art=[]))

concepts.append(dict(
    id="BODY-04", name_zh="主动稳定尾臂（偏航伺服+端部云台+调谐阻尼）", name_en="Actively stabilised tail boom (yaw servo + tip gimbal + tuned damper)",
    lens="body", one_liner="根部偏航电机按速度方向对准尾臂，端部三轴云台挂非 360 高画质相机，杆内调谐质量阻尼器。",
    principle="用作动器把相机姿态从躯干解耦；用 TMD 压低一阶模态。",
    architecture=dict(carrier="2 m 碳管", support="髋带+偏航轴承+电机", energy="电机+云台 ~20–40 W 峰值", sensing="IMU+GNSS 航向+相机视觉跟踪",
                      imaging="1 英寸类单镜头相机+云台（画质↑，但杆可见需构图避开）", use_flow="同 BODY-01 + 开机自检"),
    viewpoints=[vp("rear, heading-locked", v20["elevation_deg"], v20["distance_to_centre_m"], "镜头跟速度方向而非骨盆")],
    key_numbers={
        "yaw_servo_peak_torque_0.5Hz": kn(act[(2.0, 0.5)]["peak_torque_Nm"], "N·m", "calc", "±45° @0.5 Hz"),
        "yaw_servo_peak_torque_1Hz": kn(act[(2.0, 1.0)]["peak_torque_Nm"], "N·m", "calc", "反作用力矩全部回到骨盆"),
        "gimbal_mass_added": kn("0.15–0.3", "kg", "assumed", "降低 f1 约 25–40%"),
        "translation_not_fixable_by_gimbal": kn(b20d["mogul_rel_tip_amp_mm"], "mm", "calc", "云台只修旋转"),
    },
    scores=dict(footage=sc(4, "可用更好传感器，构图稳定"), interference=sc(2, "反作用力矩、质量 +0.5 kg"),
                convenience=sc(2, "电池、开机、低温"), safety=sc(3, "同尾臂，电机失控风险"), simplicity=sc(1, "多作动器+控制")),
    bold_hypothesis="对 360 相机而言主动稳定几乎无增益（电子稳定已解决旋转），只有换非 360 高画质相机时才值得。",
    falsification_test="同一 2 m 臂，比较 360+电子稳定 与 云台+平面相机 在猫跳道的残余抖动与盲评画质。",
    kill_criteria=["360 电子稳定盲评不劣于云台方案", "偏航伺服反作用使滑雪者主观干扰评分显著上升"],
    sim_plan=dict(what_to_model="BODY-01 柔性梁 + 根部偏航电机（PD 跟踪速度航向）+ 端部云台三轴 + TMD 质量-弹簧", states=common_states + ["servo angle/current", "gimbal angles", "TMD state"],
                  scenarios=["carving", "短弯", "猫跳"], metrics=["反作用力矩", "残余角抖动", "功耗"]),
    prior_art=[PA["insta_backpack"]]))

concepts.append(dict(
    id="BODY-05", name_zh="风向标自由偏航尾臂", name_en="Weathervane free-yaw trailing boom",
    lens="body", one_liner="尾臂根部为带阻尼与 ±60° 限位的自由偏航轴，杆尖小尾翼让气流把相机‘吹’到运动方向正后方，骨盆扭转不传给相机。",
    principle="使尾臂偏航惯量的加速力矩由气动力而非滑雪者提供：骨盆只承受侧向力，不承受偏航力矩；相机方位跟随速度矢量（真实跟拍的定义）。",
    architecture=dict(carrier="2 m 碳管 + 0.03 m² 尾翼", support="髋带框架上的偏航轴承 + 旋转粘性阻尼 + 弱回中弹簧 + 机械限位", energy="无",
                      sensing="可选角度编码器（用于后期稳定/元数据）", imaging="360 相机", use_flow="同 BODY-01；低速（<5 m/s）回中锁销"),
    viewpoints=[vp("velocity-aligned rear ±(lag)", v20["elevation_deg"], v20["distance_to_centre_m"], "转弯时相机方位相对身体摆动，获得侧后视角变化")],
    key_numbers={
        "aero_yaw_stiffness_15ms": kn(wv[1]["k_aero_Nm_per_rad"], "N·m/rad", "calc", "CLα≈3/rad 低展弦比翼（假设）"),
        "weathervane_fn_8ms": kn(wv[0]["f_n_Hz"], "Hz", "calc", ""),
        "weathervane_fn_15ms": kn(wv[1]["f_n_Hz"], "Hz", "calc", ""),
        "phase_lag_0.5Hz_turns_8ms": kn(wv[0]["phase_lag_deg_at_0p5Hz_zeta0p5"], "deg", "calc", "低速跟不上 → 大幅漂移"),
        "phase_lag_0.5Hz_turns_15ms": kn(wv[1]["phase_lag_deg_at_0p5Hz_zeta0p5"], "deg", "calc", ""),
        "yaw_torque_on_skier_vs_rigid": kn(f"≈0（仅阻尼/轴承） vs 刚性 {act[(2.0, 0.5)]['peak_torque_Nm']}–{act[(2.0, 1.0)]['peak_torque_Nm']}", "N·m", "calc", ""),
        "lateral_force_at_pivot_1.5g": kn(round(0.6 * 1.5 * 9.81, 1), "N", "calc", "boom+cam ~0.6 kg"),
        "tip_sweep_radius": kn(round(2.0 * math.cos(math.radians(15)), 2), "m", "calc", "与他人间距风险"),
    },
    scores=dict(footage=sc(3, "方位跟速度、多变化，但低速漂移/滞后不可控"), interference=sc(4, "偏航力矩解耦"),
                convenience=sc(3, "同尾臂 + 低速锁销"), safety=sc(2, "杆尖横扫 ±60° 范围大，对他人风险"), simplicity=sc(3, "轴承+阻尼器+翼")),
    bold_hypothesis="‘被动跟随速度方向’的尾臂比刚性尾臂更像真跟拍，且滑雪者感觉不到偏航负担。",
    falsification_test="自行车/滑板车上 8–15 m/s 蛇形骑行测偏航角滞后与振荡；若 10 m/s 下相位滞后 >90° 或出现持续摆振则否。",
    kill_criteria=["10 m/s 下摆振或滞后 >90°", "杆尖横扫进入相邻滑雪者 1.5 m 安全距离的频次不可接受", "侧风导致相机方位漂移 >30°"],
    sim_plan=dict(what_to_model="偏航铰 + 线性气动尾翼（攻角→侧力，失速限幅）+ 粘性阻尼 + 限位碰撞；滑雪者轨迹产生的相对来流（含侧风）",
                  states=common_states + ["boom yaw angle/rate", "fin AoA"], scenarios=["carving 0.5 Hz @8 与 15 m/s", "短弯 1 Hz", "侧风 5 m/s", "低速滑行/停止", "他人从侧方经过"],
                  metrics=["相机方位相对速度矢量误差", "传到骨盆的偏航力矩", "杆尖横扫包络", "限位撞击次数"]),
    prior_art=[]))

concepts.append(dict(
    id="BODY-06", name_zh="高位背负桅杆", name_en="Overhead backpack mast",
    lens="body", one_liner="背包竖直伸出 1.6 m 桅杆（后倾 25°），相机在头顶上方俯拍。",
    principle="身体系内转弯载荷沿躯干轴 → 竖直桅杆主要受轴压，弯曲小。",
    architecture=dict(carrier="伸缩碳管 1.6 m", support="背包框架", energy="无", sensing="-", imaging="360", use_flow="同尾臂"),
    viewpoints=[vp("overhead-rear", vm["elevation_deg"], vm["distance_to_centre_m"], "俯视、头肩占主导")],
    key_numbers={"body_px_5.7K": kn(vm["body_px_native_5.7K"], "px", "calc", ""), "head_feet_scale": kn(vm["head_vs_feet_scale_ratio"], "ratio", "calc", "强透视缩短"),
                 "camera_height_above_snow": kn(round(vm["cam_xyz_m"][2], 2), "m", "calc", "")},
    scores=dict(footage=sc(2, "俯视缩短，看不到动作姿态"), interference=sc(3, "横滚惯量增加较多"), convenience=sc(3, "同尾臂"),
                safety=sc(2, "树枝、缆车钢缆/吊椅、摔倒先着地"), simplicity=sc(4, "简单")),
    bold_hypothesis="俯拍能替代后方视角。", falsification_test="仿真盲评：同长度尾臂 vs 桅杆画面。",
    kill_criteria=["主体姿态可读性评分显著低于尾臂"],
    sim_plan=dict(what_to_model="竖直柔性梁+屈曲检查", states=common_states, scenarios=["carving", "过树林", "摔倒"], metrics=["主体可读性", "根部力矩"]),
    prior_art=[PA["insta_backpack"]]))

concepts.append(dict(
    id="BODY-07", name_zh="雪杖一体伸缩相机杆（前向机位）", name_en="Ski-pole-integrated camera pole (front view)",
    lens="body", one_liner="一根雪杖握把内藏 1.1 m 伸缩隐形杆+360 相机，握把处对重；与尾臂互补提供前方/面部视角。",
    principle="利用手臂已有的握持；前方低位可见面部与板头。",
    architecture=dict(carrier="伸缩铝/碳杆", support="手持雪杖", energy="无", sensing="-", imaging="360", use_flow="出杆→开录；点杖时改用另一手"),
    viewpoints=[vp("front-low", vp_["elevation_deg"], vp_["distance_to_centre_m"], "唯一能看到正面的身体载体")],
    key_numbers={"body_px_5.7K": kn(vp_["body_px_native_5.7K"], "px", "calc", "近，几乎全幅"),
                 "pole_mount_fit": kn("14–22", "mm", "lit", "Insta360/GoPro ski pole mounts"),
                 "vendor_caveat": kn("不建议高速/自由式", "-", "lit", "Insta360 product notes")},
    scores=dict(footage=sc(3, "正面、近、受手臂摆动影响"), interference=sc(3, "占一只手的点杖动作"), convenience=sc(4, "已有产品"),
                safety=sc(3, "摔倒时杆件伤人/伤己"), simplicity=sc(5, "最简单")),
    bold_hypothesis="尾臂(后)+雪杖杆(前) 双源 + 自动导演，可覆盖 80% 精彩镜头需要。",
    falsification_test="现成产品实测：点杖与相机抖动；双源剪辑盲评。",
    kill_criteria=["点杖动作被明显改变", "画面在 >10 m/s 时不可用"],
    sim_plan=dict(what_to_model="手臂摆动驱动的杆件（刚体）+ 点杖事件", states=common_states + ["arm pose"], scenarios=["点杖短弯", "carving 无点杖"], metrics=["相机角速度", "主体占比"]),
    prior_art=[PA["insta_pole"], PA["insta_pole_news"], PA["gopro_pole"]]))

concepts.append(dict(
    id="BODY-08", name_zh="头盔/肩部长杆", name_en="Helmet / shoulder long stick",
    lens="body", one_liner="头盔后上方 0.5–0.8 m 杆或肩带杆。",
    principle="短杆即可抬高视点。",
    architecture=dict(carrier="短碳杆", support="头盔/肩带", energy="无", sensing="-", imaging="360", use_flow="常驻"),
    viewpoints=[vp("rear-high very close", vh["elevation_deg"], vh["distance_to_centre_m"], "头顶视角、极度透视")],
    key_numbers={"neck_moment_static_0.5m": kn(hel[0.5]["static_neck_moment_Nm"], "N·m", "calc", ""),
                 "neck_moment_3g_0.5m": kn(hel[0.5]["moment_at_3g_Nm"], "N·m", "calc", ""),
                 "head_yaw_inertia_added_0.5m": kn(hel[0.5]["added_head_yaw_I_kgm2"], "kg·m²", "calc", "头部偏航 ~0.025 kg·m² (assumed) → +250%"),
                 "head_feet_scale": kn(vh["head_vs_feet_scale_ratio"], "ratio", "calc", "")},
    scores=dict(footage=sc(2, "过近、头大脚小"), interference=sc(1, "头部惯量×3.5，观察转头受限"), convenience=sc(4, "常驻"),
                safety=sc(1, "摔倒时杠杆作用于颈部/头盔旋转，违背头盔设计"), simplicity=sc(5, "简单")),
    bold_hypothesis="—（此项用于明确否决）", falsification_test="无需实测：力学数字已构成否决；肩部变体归入 BODY-01。",
    kill_criteria=["任何把 >0.3 m 杠杆加在头部的设计"], sim_plan=dict(what_to_model="头颈刚体+杆", states=common_states, scenarios=["摔倒头部着地"], metrics=["颈部力矩"]),
    prior_art=[]))

concepts.append(dict(
    id="BODY-09", name_zh="牵引/硬辕摄影滑橇", name_en="Towed or shafted camera sled",
    lens="body", one_liner="3 kg 小滑橇（带龙骨）载 1.4 m 桅杆+360，用 5 m 绳或 3 m 硬辕连接髋带，获得真正‘跟在后面’的低透视视角。",
    principle="雪面承重，相机重力不经悬臂；透视接近真跟拍（头脚比≈1.04）。",
    architecture=dict(carrier="滑橇+龙骨+桅杆", support="雪面；绳/硬辕到髋带", energy="无（或松绳触发爪式刹车）", sensing="-", imaging="360",
                      use_flow="缆车上需手提/挂背包；坡底拖行"),
    viewpoints=[vp("rear-low follow", vs["elevation_deg"], vs["distance_to_centre_m"], "最像跟拍的透视，但低")],
    key_numbers={
        "body_px_5.7K": kn(vs["body_px_native_5.7K"], "px", "calc", ""),
        "tow_force_flat_15ms_mu0.06": kn(next(r["tow_force_N"] for r in sled["tow_force"] if r["mu"] == 0.06 and r["v"] == 15 and r["slope_deg"] == 0), "N", "calc", "μ 0.03–0.1 (Kuroiwa, lit)"),
        "tow_force_20deg": kn(next(r["tow_force_N"] for r in sled["tow_force"] if r["mu"] == 0.06 and r["v"] == 15 and r["slope_deg"] == 20), "N", "calc", "负值 = 滑橇会追尾/超车，绳松"),
        "turn_centripetal_R15": kn(next(t["centripetal_N"] for t in sled["turns"] if t["R"] == 15 and t["tether"] == 5 and t["v"] == 15), "N", "calc", "需龙骨或绳拉，拉力进髋带"),
        "cut_inside_R15_L5": kn(next(t["cut_inside_m"] for t in sled["turns"] if t["R"] == 15 and t["tether"] == 5 and t["v"] == 15), "m", "calc", ""),
        "stop_overrun_KE_15ms": kn(sled["stop_from_15"]["sled_KE_J"], "J", "calc", ""),
        "skier_stop_dist_vs_sled_claw_stop": kn(f"{sled['stop_from_15']['skier_stop_m']} vs {sled['stop_from_15']['claw_brake_stop_m']}", "m", "calc", "15° 坡，爪刹 μ 0.5"),
        "mogul_airtime": kn(sled["mogul_airtime_s_h0p5"], "s", "calc", "0.5 m 猫跳"),
    },
    scores=dict(footage=sc(3, "透视最好，但低位、雪面颠簸、猫跳失效"), interference=sc(2, "转弯 40–80 N 横向拉力、急停追尾"),
                convenience=sc(1, "缆车搬运、排队、绳缠"), safety=sc(1, "绳横跨雪道=绊索；超车撞击 ~340 J"), simplicity=sc(3, "机构简单，行为复杂")),
    bold_hypothesis="硬辕+龙骨滑橇可在圧雪道巡航中提供最接近跟拍的透视。",
    falsification_test="平缓圧雪道 3 kg 滑橇+硬辕实测急停与弯道甩尾；若急停时滑橇撞到小腿或甩尾横向位移 >1 m 则否。",
    kill_criteria=["10° 以上坡面绳松超车不可避免", "滑雪场规定禁止拖拽物", "硬辕在急停时折叠撞人"],
    sim_plan=dict(what_to_model="滑橇刚体（库仑摩擦 μ(v)、龙骨侧向摩擦、雪面高程/猫跳）+ 绳（单边弹簧，松弛）或硬辕（铰接杆）连接移动髋点",
                  states=["sled pose/vel", "tether tension/slack", "skier hip trajectory"], scenarios=["平坡巡航", "20° 坡 carving", "急停", "猫跳", "他人横穿绳路"],
                  metrics=["绳张力/横向力", "滑橇-滑雪者最小距离", "画面可用比例"]),
    prior_art=[PA["kuroiwa"], PA["frontiers_fric"]]))

concepts.append(dict(
    id="BODY-10", name_zh="自主雪面摄影机器人", name_en="Autonomous snow-surface camera robot",
    lens="body", one_liner="15 kg 履带/滑板机器人沿滚落线直下（不复制滑雪者的弯），在后方 8 m 拍摄。",
    principle="机器人走滚落线时平均下坡速度 = 滑雪者速度×cos(平均航向)，不需复制急弯。",
    architecture=dict(carrier="履带+雪板混合", support="雪面", energy="电池 10–30 Wh/趟+制动", sensing="UWB/GNSS RTK+视觉跟踪+障碍检测", imaging="桅杆 1.8 m 360", use_flow="缆车搬运 15 kg"),
    viewpoints=[vp("rear 8 m", vr["elevation_deg"], vr["distance_to_centre_m"], "")],
    key_numbers={
        "power_15ms_crr0.15_flat": kn(next(x["P_flat_W"] for x in rob["power"] if x["m"] == 15 and x["crr"] == 0.15 and x["v"] == 15), "W", "calc", ""),
        "min_turn_radius_15ms_mu0.4": kn(next(g["min_radius_m"] for g in rob["grip"] if g["mu_lat"] == 0.4 and g["v"] == 15), "m", "calc", "滑雪者 R 8–25 m"),
        "stop_from_12_on_20deg_mu0.5": kn(next(b["stop_from_12_m"] for b in rob["brake"] if b["mu_b"] == 0.5 and b["slope"] == 20), "m", "calc", "30° 坡 μ0.5 无法停住"),
        "KE_15kg_12ms": kn(next(k["KE_J"] for k in rob["KE"] if k["m"] == 15), "J", "calc", ""),
        "body_px_5.7K": kn(vr["body_px_native_5.7K"], "px", "calc", "")},
    scores=dict(footage=sc(3, "后方中距、低位"), interference=sc(5, "身上无负担"), convenience=sc(1, "搬运 15 kg、缆车"),
                safety=sc(1, "1 kJ 失控物体在人群雪道"), simplicity=sc(1, "自主导航+制动")),
    bold_hypothesis="滚落线直下策略可让雪面机器人跟上 15 m/s 滑雪者。", falsification_test="仿真：给定雪道人群密度与 20° 坡，统计无法安全停止事件。",
    kill_criteria=["20° 坡制动距离 >20 m", "缆车不能携带", "雪场禁止自主车辆"],
    sim_plan=dict(what_to_model="非完整约束车辆+雪面摩擦椭圆+坡度+制动", states=["robot pose/vel", "brake state"], scenarios=["滚落线跟随", "人群避让", "急停"], metrics=["跟随距离", "制动距离", "碰撞"]),
    prior_art=[PA["kuroiwa"]]))

concepts.append(dict(
    id="BODY-11", name_zh="双侧短臂 + 视点合成", name_en="Dual hip outriggers with view synthesis",
    lens="body", one_liner="两侧髋部各伸 0.8 m 短臂挂 360 相机，用双目重建合成后上方虚拟视点。",
    principle="短臂惯量小；基线 1.6 m 做立体重建。",
    architecture=dict(carrier="2× 0.8 m 碳杆", support="髋带", energy="无", sensing="同步双 360", imaging="离线重建", use_flow="同尾臂"),
    viewpoints=[vp("left/right real; virtual rear-high", 20, 1.0, "虚拟 2 m 后方视点属外推，非插值")],
    key_numbers={"yaw_inertia_added": kn(round(2 * 0.2 * 0.8 ** 2, 2), "kg·m²", "calc", ""),
                 "baseline": kn(1.6, "m", "calc", "")},
    scores=dict(footage=sc(2, "真实视点只有两侧近距；虚拟后视点无观测支撑（docs/18 O27 边界）"), interference=sc(3, "侧伸妨碍点杖与手臂"),
                convenience=sc(3, ""), safety=sc(3, "侧向突出"), simplicity=sc(2, "重建算法")),
    bold_hypothesis="外推新视点可被观众接受。", falsification_test="离线：用已知真值视点比较合成误差。",
    kill_criteria=["合成视点的人体结构错误率不可接受（按 O27 规则不得冒充真实视点）"],
    sim_plan=dict(what_to_model="两台虚拟相机 + 视锥覆盖分析（不做真实重建）", states=common_states, scenarios=["carving"], metrics=["人体表面双目覆盖率"]),
    prior_art=[]))

concepts.append(dict(
    id="BODY-12", name_zh="摆臂/等弹性隔振尾臂根座", name_en="Pendulum / iso-elastic sprung boom root",
    lens="body", one_liner="尾臂根部做俯仰铰+弹簧（类似 Steadicam 等弹性臂），隔离猫跳竖向颠簸。",
    principle="单自由度基础隔振：f_iso < f_excite/√2 才隔振。",
    architecture=dict(carrier="尾臂", support="俯仰铰+弹簧+阻尼（可选慢速电动调平）", energy="无/小电机", sensing="铰角", imaging="360", use_flow="同尾臂"),
    viewpoints=[vp("rear", v20["elevation_deg"], v20["distance_to_centre_m"], "")],
    key_numbers={
        "drift_per_g_at_f0.7Hz": kn(iso[(0.7, 0.3)]["drift_per_g_m"], "m", "calc", "转弯载荷 1→1.8 g 时额外下沉 " + str(iso[(0.7, 0.3)]["drift_turn_extra_0p8g_m"]) + " m"),
        "transmissibility_mogul_2Hz_f0.7": kn(iso[(0.7, 0.3)]["T_mogul_2Hz"], "-", "calc", ""),
        "transmissibility_turn_0.5Hz_f0.7": kn(iso[(0.7, 0.3)]["T_turn_0p5Hz"], "-", "calc", "转弯节奏被放大"),
        "transmissibility_mogul_2Hz_f1.5": kn(iso[(1.5, 0.3)]["T_mogul_2Hz"], "-", "calc", "f_iso 抬高后猫跳反被放大"),
    },
    scores=dict(footage=sc(2, "猫跳隔振与转弯漂移不可兼得"), interference=sc(3, ""), convenience=sc(3, ""), safety=sc(3, ""), simplicity=sc(2, "")),
    bold_hypothesis="主动慢速调平（<0.3 Hz 积分回中）+ 软弹簧可同时解决漂移与猫跳。",
    falsification_test="仿真：带积分回中的 0.7 Hz 隔振器在 carving+猫跳组合谱下的残余平移；若不优于 ζ=0.15 刚性臂则放弃。",
    kill_criteria=["被动方案：转弯漂移 >0.2 m（计算已基本否决）", "主动方案：功耗/复杂度 > 收益"],
    sim_plan=dict(what_to_model="根部俯仰 SDOF 隔振 + 尾臂柔性 + 可选积分调平控制", states=common_states + ["iso angle"], scenarios=["carving+猫跳叠加"], metrics=["相机竖向平移 RMS", "漂移"]),
    prior_art=[]))

json.dump(concepts, open(os.path.join(HERE, "concepts.json"), "w"), ensure_ascii=False, indent=1)
print(len(concepts), "concepts written")
for c in concepts:
    s = c["scores"]
    tot = sum(v["score"] for v in s.values())
    print(c["id"], c["name_en"], {k: v["score"] for k, v in s.items()}, "sum", tot)
print("V-truss lateral k", round(k_lat_truss), "N/m vs single", round(k_lat_single, 1), "f_lat_ub", round(f_lat_truss, 1))
