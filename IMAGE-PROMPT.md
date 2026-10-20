# 像素鲸鱼娘素材

使用内置 imagegen 工具生成，透明背景，未使用 CLI 或用户 API Key。

当前资产：`assets/whale-girl-v2.png`。初版归档：`assets/whale-girl-v1.png`。保留原始 PNG 和 alpha；0.4.0 默认采用较清晰绘制，开启像素化时以最近邻采样放大。原图实际为 1254×1254。生成结果按 4×4 网格读取，v2 的行边界在 `skin.json` 中明确配置，避免把上一行的脚底读入下一帧。

用户最初的机器人附件作为像素轮廓与简约展示参考。初版鲸鱼娘的设计方向参考了[社区鲸鱼娘设计](https://linux.do/t/topic/2793169)。v2 根据用户新提供的鲸鱼娘附件，把头发改为较深的靛蓝、裙子改为藏蓝，保留鲸尾、去掉鲸尾形发卡。素材使用内置 imagegen 重新生成。

## 0.2.0 初版生成提示词

Use case: stylized-concept. Asset type: production transparent pixel-art sprite sheet for a tiny desktop companion, not a UI mockup.

Input image 1 is STYLE AND SIMPLICITY REFERENCE ONLY: its chunky readable pixel silhouette, dark navy outline and blue colors. Create an original chibi DeepSeek-inspired whale girl, NOT a robot: oversized cute head, deep cobalt-blue short bob hair ending in whale-fin tufts, a tiny whale-tail hair accessory, big teal eyes, pale face with pink cheeks, a fully covered blue-and-white little maid dress with white apron and sailor collar, dark blue shoes, and a small visible whale tail behind her. Friendly, slightly silly. Character must be legible at 80px tall. Crisp genuine pixel art: hard square pixel edges, limited 16-color blue/navy/white/teal palette, no smoothing, no gradients, no glow.

Output a single square 1024x1024 PNG with REAL transparent alpha, exact 4 COLUMN by 4 ROW sprite grid. Each cell exactly 256x256, each sprite wholly centered in its cell with identical scale and feet baseline, transparent empty gutters at least 24px on all sides. Full-body character height 176px (roughly 44x44 pixel drawing scaled 4x), facing front or slight three-quarter right. Exactly 16 separate sprites, 1 per cell, no overlap. Consistent SAME character identity and clothing in all frames.

Row 1: four idle loop frames: relaxed pose, blink, gentle breathing, relaxed pose. Row 2: four thinking loop frames: hand to chin, eyes thoughtful, slight head tilt; no thought bubble. Row 3: four wave/greeting/completion frames: lifts one hand, waves, smiles with closed eyes, hand down. Row 4: four working frames: focused pose holding a tiny spanner at chest level, small arm movement, focused pose, small arm movement.

No aquarium, water, scenery, panel, rectangle, UI, frame, background, captions, labels, grid lines, checkerboard drawn into image, text or watermark. Transparent background contains only the isolated pixel characters. Do not copy the reference robot; only use its minimal desktop-pet presentation and pixel treatment.

## 0.3.0 修订生成提示词

参考顺序：Image 1 为项目中的 `assets/whale-girl-v1.png`；Image 2 为用户提供的蓝发鲸鱼娘附件。工具参数 `transparent_background: true`。

Use case: identity-preserve / sprite refinement. Asset type: transparent pixel desktop pet sprite sheet.

Image 1 is the EDIT TARGET: its 4x4 sheet of the same chibi whale girl with 16 poses. Image 2 is a COLOR AND CHARACTER DETAIL REFERENCE only. Refine image 1's character to use the muted deep blue hair of image 2 (indigo/navy blue around #344f91 rather than electric royal blue) and a similar dark navy blue dress around #233455 with white apron and white ruffles. Slightly longer blue hair with side whale-fin tufts, pale face and blue eyes, white maid headband with a tiny normal blue bow. KEEP the small blue whale tail behind the body. REMOVE the whale-tail-shaped hair clip entirely from all 16 frames; no whale-tail-shaped accessory on the head. Fully covered cute blue-and-white maid outfit, little navy shoes.

Preserve the 4 ROWS x 4 COLUMNS sheet, 16 full-body sprites. Exact square equal cells, full-body sprites centered with same scale, aligned head/body anchor and identical feet baseline. Leave at least 20% transparent padding around each character and between cells. Output square 1024x1024 (cells256) if possible. Transparent alpha background ONLY, no drawn checkerboard, no shadows, no ground, no scenery, no captions, no text or lines.

Make this clearer, more restrained genuine PIXEL ART: chunky visible square pixels, dark navy stepped outlines, limited flat-color palette, no antialiased/smooth illustration edges, no gradients, no painterly texture. Character suitable for 64x64 logical-pixel rendering, tiny details simplified. Cute compact silhouette; large head but visible body, dress, arms and feet.

Row1 four idle poses: relaxed, blink, subtle breath, relaxed. Row2 four thinking poses: hand to chin, small thoughtful head tilt and eyes; no thought bubble. Row3 four completion/wave poses: hand lifts, gentle waving, closed-eye happy smile, hand lowers. Row4 four working poses: holds tiny spanner at chest, small arm motion, focused face, small arm motion. SAME face, hair colors, clothing proportions and headband throughout. Do not add the removed whale-tail hairpin back.
