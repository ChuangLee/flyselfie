# SledPack 概念宣传片（SIM-033）

**证据等级**：概念可视化。全部画面为计算机仿真渲染，不是实拍。运动和收放过程是剧本化示意（`sim/js/promo/timeline.js`），不是求解器输出。片中数字只能来自 `../dev/promo_facts.json` 和 `results.json`，并标注“仿真”。G-MATURE 仍关闭，M-070 仍为 NOT_RUN。

## 文件

| 路径 | 作用 |
|---|---|
| `sim/promo.html`、`sim/js/promo/main.js` | 3D 层，逐帧确定性渲染。接口 `window.__promo.seek(t)` |
| `sim/js/promo/timeline.js` | 剧本：分段、骑手轨迹、线长、仰角、开合、泄力，以及示意 HUD 状态机 |
| `sim/js/promo/gear.js` | 无杆背包：双卷轴、电池、脊柱套管、腰下喇叭口；单层软翼雪橇风筝；吊舱；主线与泄力线 |
| `sim/js/promo/shots.js` | 每段一个缓动机位 |
| `sim/promo_overlay.html`、`sim/js/promo/overlay.js`、`sim/css/promo_overlay.css` | 文字层（透明）：每帧都有角标、字幕、标注线、HUD、数字卡、片尾声明 |
| `copy.json` | 中英文文案与数字。修改后只需重渲文字层 |
| `sim/tools/render_promo.py` | 流水线：3D 帧、文字帧、合成音乐、ffmpeg 合成 |

## 重新渲染

```bash
python3 sim/tools/render_promo.py --stage 3d     # 慢：SwiftShader 软件渲染 1280×720、24 fps，可断点续渲
python3 sim/tools/render_promo.py --stage text   # 快：中英文字层 + 合成，输出 output/video/sledpack_promo_{zh,en}.mp4
```

改动 `copy.json` 只需运行 `--stage text`。改动 `timeline.js`、`gear.js` 或 `shots.js` 后，要先删除帧目录（默认在会话 scratchpad 的 `promo_frames/`），再从 `--stage 3d` 开始重渲。
