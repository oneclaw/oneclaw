<!-- officecli-pptx reference -->
# Recipes（常见场景修复指南）

以下配方针对实际制作中高频出现的视觉问题，每条均为可直接执行的修复方案。

### Recipe 1：Section Divider — 标签文字与装饰元素重叠

**问题根因：** 后添加的 shape 在 z-order 上层；若装饰 shape（圆、矩形）在文字 shape 之后添加，会覆盖文字，导致标题不可读。

**修复规则：**
1. **添加顺序即 z-order**：装饰元素（圆、色块）必须先添加，文字 shape 后添加——后添加的自动在最上层。
2. **标题文字 y 位置建议 7–10cm**（slide 高 19.05cm），避免与顶部或底部装饰元素重叠。
3. 若需调整已有 shape 的层级，使用 `--prop zorder=back`（装饰元素）或 `--prop zorder=front`（文字）。

```bash
# 正确顺序示例（装饰先，文字后）
officecli add slides.pptx / --type slide --prop layout=blank --prop "background=1E2761-CADCFC-180"

# 第1步：装饰元素（大半透明数字作为背景图形）— 先添加，在底层
officecli add slides.pptx /slide[N] --type shape --prop text="02" \
  --prop x=2cm --prop y=4cm --prop width=29.87cm --prop height=8cm \
  --prop font=Georgia --prop size=120 --prop bold=true \
  --prop color=FFFFFF --prop align=center --prop fill=none --prop opacity=0.15

# 第2步：左侧装饰色条（可选）— 装饰元素，在底层
officecli add slides.pptx /slide[N] --type shape \
  --prop preset=rect --prop fill=FFFFFF --prop opacity=0.2 \
  --prop x=0cm --prop y=7cm --prop width=6cm --prop height=0.4cm --prop line=none

# 第3步：标题文字 — 最后添加，自动在最上层，y 建议 7–10cm
officecli add slides.pptx /slide[N] --type shape --prop text="Financial Performance" \
  --prop x=2cm --prop y=7.5cm --prop width=29.87cm --prop height=3cm \
  --prop font=Georgia --prop size=40 --prop bold=true \
  --prop color=FFFFFF --prop align=center --prop fill=none

# 第4步：副标题（可选）
officecli add slides.pptx /slide[N] --type shape --prop text="Section 2 of 4" \
  --prop x=2cm --prop y=11cm --prop width=29.87cm --prop height=1.5cm \
  --prop font=Calibri --prop size=16 --prop color=CADCFC --prop align=center --prop fill=none
```

**事后检查（如遇覆盖问题）：**
```bash
# 将装饰元素压到最底层
officecli set slides.pptx "/slide[N]/shape[1]" --prop zorder=back
# 将文字拉到最顶层
officecli set slides.pptx "/slide[N]/shape[3]" --prop zorder=front
# 注意：zorder 操作后 shape index 会重新编号，须重新 get --depth 1 再操作
officecli get slides.pptx '/slide[N]' --depth 1
```

---

### Recipe 2：KPI Box — 数字/文字溢出 box 边界

**问题根因：** KPI 数字字号过大，超出 box 的 height 或 width 范围；或 box 尺寸未为数字字号留足空间。

**字号安全公式：**
- `推荐最大字号(pt) ≤ box_width_cm × 字符数分母`
  - 1–2 个字符（如 "94%"）：`box_width_cm × 10` pt 为上限，建议用 60–72pt
  - 3–4 个字符（如 "1.2M"）：`box_width_cm × 7` pt 为上限，建议用 48–56pt
  - 5+ 个字符：`box_width_cm × 5` pt 为上限，建议用 36–44pt
- `box height ≥ 字号(cm) × 1.5`（字号 1pt ≈ 0.0353cm；64pt ≈ 2.26cm，则 height ≥ 3.4cm）

**验证规则（必做）：** 每个 KPI box 创建后，用 `officecli view annotated` 确认无溢出。

```bash
# KPI box 安全模板（以 9cm 宽 box、3字符数字为例）
# 9cm 宽 × 3 字符 → 最大字号约 9×7=63pt → 使用 60pt
# box height ≥ 60pt × 0.0353cm × 1.5 ≈ 3.2cm → 设为 4cm（留余量）

officecli add slides.pptx /slide[N] --type shape \
  --prop text="94%" \
  --prop x=2cm --prop y=5cm \
  --prop width=9cm --prop height=4cm \
  --prop font=Georgia --prop size=60 --prop bold=true \
  --prop color=CADCFC --prop align=center --prop valign=center --prop fill=none

# sublabel（KPI 说明标注，≤5 词，允许 < 16pt）
officecli add slides.pptx /slide[N] --type shape \
  --prop text="Customer Retention" \
  --prop x=2cm --prop y=9.2cm \
  --prop width=9cm --prop height=1.5cm \
  --prop font=Calibri --prop size=13 --prop color=8899BB --prop align=center --prop fill=none
```

**溢出修复流程：**
1. 发现溢出 → 先缩小字号（每次减 4pt，重新检查）
2. 字号已足够小但仍溢出 → 扩大 box `height`（y 值相应上移）
3. 不得缩短数字本身（"$1.2M" 不能改成 "$1M" 只为字号合规）

```bash
# 验证命令
officecli view slides.pptx annotated
# 检查每个 KPI shape 的 y+height 是否 ≤ 19.05cm
officecli get slides.pptx '/slide[N]/shape[M]'
```

---

### Recipe 3：Timeline — 最后节点孤立（间距不均匀）

**问题根因：** 直接将最后节点 x 设为 `slide_width - right_margin` 时，浮点精度差异导致其与相邻节点间距偏大，视觉上"孤立"。

**均匀间距公式：**
```
left_margin   = 2cm（或按设计）
right_margin  = 2cm（或按设计）
circle_width  = 节点圆的宽度（例如 3cm）

# CRITICAL: usable_width 必须减去 circle_width，否则最后节点右边界会溢出幻灯片
usable_width = slide_width - left_margin - right_margin - circle_width
             = 33.87 - 2 - 2 - 3 = 26.87cm（标准 16:9，circle_width=3cm）

node_spacing = usable_width / (N - 1)   # N = 节点总数

node_x[i]   = left_margin + node_spacing × i   # i = 0, 1, ..., N-1
```

> **为什么减 circle_width？** `node_x[i]` 是圆的**左边 x**，最后节点右边界 = `node_x[N-1] + circle_width`。不减的话右边界会超出幻灯片边缘（33.87cm），导致 P1 截断错误。

**示例（4 节点，节圆宽 3cm）：**
```
usable_width = 33.87 - 2 - 2 - 3 = 26.87cm
node_spacing = 26.87 / 3 ≈ 8.957cm

node_x[0] = 2cm              → circle x=2cm,     右边 5cm    ✓
node_x[1] = 2 + 8.957      = 10.957cm → circle x=10.96cm,   右边 13.96cm  ✓
node_x[2] = 2 + 8.957×2    = 19.914cm → circle x=19.91cm,   右边 22.91cm  ✓
node_x[3] = 2 + 8.957×3    = 28.87cm  → circle x=28.87cm,   右边 31.87cm  ✓ (< 33.87)
```

```bash
# 4 节点均匀时间轴示例（node_spacing ≈ 8.957cm，圆宽 3cm，usable_width=26.87cm）
# 水平基准线（从第一节点圆心到最后节点圆心）
officecli add slides.pptx /slide[N] --type connector \
  --prop x=3.5cm --prop y=10cm --prop width=27.87cm --prop height=0 \
  --prop line=CADCFC --prop lineWidth=2pt

# 节点 1（i=0）  x = 2cm，右边 5cm ✓
officecli add slides.pptx /slide[N] --type shape \
  --prop preset=ellipse --prop fill=1E2761 \
  --prop x=2cm --prop y=8.5cm --prop width=3cm --prop height=3cm --prop line=none
officecli add slides.pptx /slide[N] --type shape --prop text="Q1" \
  --prop x=2cm --prop y=8.5cm --prop width=3cm --prop height=3cm \
  --prop fill=none --prop color=FFFFFF --prop size=16 --prop bold=true \
  --prop align=center --prop valign=center

# 节点 2（i=1）  x = 2 + 8.957 = 10.957cm → 取 10.96cm，右边 13.96cm ✓
officecli add slides.pptx /slide[N] --type shape \
  --prop preset=ellipse --prop fill=CADCFC \
  --prop x=10.96cm --prop y=8.5cm --prop width=3cm --prop height=3cm --prop line=none
officecli add slides.pptx /slide[N] --type shape --prop text="Q2" \
  --prop x=10.96cm --prop y=8.5cm --prop width=3cm --prop height=3cm \
  --prop fill=none --prop color=1E2761 --prop size=16 --prop bold=true \
  --prop align=center --prop valign=center

# 节点 3（i=2）  x = 2 + 8.957×2 = 19.914cm → 取 19.91cm，右边 22.91cm ✓
officecli add slides.pptx /slide[N] --type shape \
  --prop preset=ellipse --prop fill=1E2761 \
  --prop x=19.91cm --prop y=8.5cm --prop width=3cm --prop height=3cm --prop line=none
officecli add slides.pptx /slide[N] --type shape --prop text="Q3" \
  --prop x=19.91cm --prop y=8.5cm --prop width=3cm --prop height=3cm \
  --prop fill=none --prop color=FFFFFF --prop size=16 --prop bold=true \
  --prop align=center --prop valign=center

# 节点 4（i=3）  x = 2 + 8.957×3 = 28.871cm → 取 28.87cm，右边 31.87cm ✓ (< 33.87)
officecli add slides.pptx /slide[N] --type shape \
  --prop preset=ellipse --prop fill=CADCFC \
  --prop x=28.87cm --prop y=8.5cm --prop width=3cm --prop height=3cm --prop line=none
officecli add slides.pptx /slide[N] --type shape --prop text="Q4" \
  --prop x=28.87cm --prop y=8.5cm --prop width=3cm --prop height=3cm \
  --prop fill=none --prop color=1E2761 --prop size=16 --prop bold=true \
  --prop align=center --prop valign=center
```

**验证命令：** 创建时间轴后，检查各节点 x 坐标是否均匀分布：
```bash
officecli view slides.pptx annotated
# 或逐节点检查
officecli get slides.pptx '/slide[N]' --depth 1
# 手动验证相邻节点的 x 差值是否一致（允许 ±0.05cm 误差）
```

如发现最后节点孤立：计算实际间距（`x[N-1] - x[N-2]` vs `x[1] - x[0]`），用均匀间距公式重新设置最后节点的 x 坐标：
```bash
officecli set slides.pptx "/slide[N]/shape[M]" --prop x=31.87cm
```
