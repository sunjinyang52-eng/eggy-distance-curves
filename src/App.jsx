import { useEffect, useMemo, useRef, useState } from "react";

const MAX_X = 15;
const MAX_Y = 200;

const SERIES_ORDER = [
  "蹭墙踩头",
  "外服0.0s",
  "外服0.4s",
  "外服0.5s",
  "外服0.6s",
  "内服0.3s",
  "内服0.4s",
  "内服0.5s",
  "内服0.6s",
];

const COLORS = {
  蹭墙踩头: "#9467bd",
  "外服0.4s": "#2ca02c",
  "外服0.5s": "#d62728",
  "外服0.6s": "#1f77b4",
  "外服0.0s": "#ff7f0e",
  "内服0.3s": "#17becf",
  "内服0.4s": "#e377c2",
  "内服0.5s": "#8c564b",
  "内服0.6s": "#eab308",
};

const DISPLAY_LABELS = {
  蹭墙踩头: "蹭墙踩头",
  "外服0.4s": "外服0.4s",
  "外服0.5s": "外服0.5s",
  "外服0.6s": "外服0.6s",
  "外服0.0s": "外服0.3s",
  "内服0.3s": "内服0.3s",
  "内服0.4s": "内服0.4s",
  "内服0.5s": "内服0.5s",
  "内服0.6s": "内服0.6s",
};

const COMPARE_GROUPS = {
  "0.3s对比": ["外服0.0s", "内服0.3s"],
  "0.4s对比": ["外服0.4s", "内服0.4s"],
  "0.5s对比": ["外服0.5s", "内服0.5s"],
  "0.6s对比": ["外服0.6s", "内服0.6s"],
};

const LABEL_AT = {
  蹭墙踩头: { x: 3.55, yOffset: 5 },
  "外服0.4s": { x: 14.2, yOffset: 4 },
  "外服0.5s": { x: 10.45, yOffset: 5 },
  "外服0.6s": { x: 10.8, yOffset: -4 },
  "外服0.0s": { x: 8.2, yOffset: 8 },
  "内服0.3s": { x: 5.4, yOffset: 4 },
  "内服0.4s": { x: 7.2, yOffset: 6 },
  "内服0.5s": { x: 8.75, yOffset: -8 },
  "内服0.6s": { x: 12.0, yOffset: 8 },
};

const CAP_SPEED_LABELS = new Set(["外服0.4s"]);
const TOP_TOUCH_LABELS = new Set(["外服0.0s", "外服0.4s"]);

function displaySpeedForCurve(curve, meta) {
  if (!meta) return null;
  if (CAP_SPEED_LABELS.has(curve.label)) {
    const topTouch = crossingAtY(curve.measured, MAX_Y);
    if (topTouch?.x) return MAX_Y / topTouch.x;
  }
  return meta.speed;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    if (row.length || cell) {
      pushCell();
      rows.push(row);
      row = [];
    }
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      pushCell();
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      pushRow();
    } else {
      cell += char;
    }
  }
  pushRow();

  const headers = rows.shift()?.map((header) => header.replace(/^\uFEFF/, "")) ?? [];
  return rows
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function nearestPoint(points, targetX) {
  return points.reduce((best, point) => (Math.abs(point.x - targetX) < Math.abs(best.x - targetX) ? point : best), points[0]);
}

function crossingAtY(points, targetY) {
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const current = points[index];
    if ((prev.y < targetY && current.y >= targetY) || (prev.y > targetY && current.y <= targetY)) {
      const span = current.y - prev.y;
      if (span === 0) return current;
      const ratio = (targetY - prev.y) / span;
      return {
        x: prev.x + (current.x - prev.x) * ratio,
        y: targetY,
      };
    }
  }
  return null;
}

function drawSpeedText(ctx, text, x, y, color) {
  ctx.save();
  ctx.font = "700 14px 'Microsoft YaHei', 'PingFang SC', sans-serif";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawMeterText(ctx, text, x, y, color) {
  ctx.save();
  ctx.font = "600 12px 'Microsoft YaHei', 'PingFang SC', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawTopMeterText(ctx, text, x, y, color) {
  ctx.save();
  ctx.font = "600 12px 'Microsoft YaHei', 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function useChartData() {
  const [state, setState] = useState({ loading: true, curves: [], summary: new Map(), error: "" });

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("data/curves_with_extension.csv").then((res) => res.text()),
      fetch("data/summary.csv").then((res) => res.text()),
    ])
      .then(([curvesCsv, summaryCsv]) => {
        if (!active) return;
        const summaryRows = parseCsv(summaryCsv);
        const summary = new Map(
          summaryRows.map((row) => [
            row["曲线"],
            {
              duration: Number(row["持续时长_s"]),
              distance: Number(row["实测距离_m"]),
              speed: Number(row["平均速度_m_s"]),
              extensionRule: row["外推规则"],
            },
          ]),
        );

        const grouped = new Map();
        parseCsv(curvesCsv).forEach((row) => {
          const label = row["曲线"];
          if (!grouped.has(label)) {
            grouped.set(label, { label, server: row["服务器"], measured: [], extension: [] });
          }
          const bucket = row["类型"] === "外推" ? "extension" : "measured";
          grouped.get(label)[bucket].push({
            x: Number(row["时间_s"]),
            y: Number(row["距离_m"]),
          });
        });

        const curves = SERIES_ORDER.map((label) => grouped.get(label)).filter(Boolean);
        setState({ loading: false, curves, summary, error: "" });
      })
      .catch((error) => {
        if (active) setState({ loading: false, curves: [], summary: new Map(), error: error.message });
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}

function DistanceChart({ curves, summary, visible, showExtension }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  const activeCurves = useMemo(() => curves.filter((curve) => visible[curve.label]), [curves, visible]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;

    const render = () => {
      const rect = wrap.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(720, rect.width);
      const height = Math.max(480, Math.min(720, width * 0.56));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);

      const ctx = canvas.getContext("2d");
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const pad = {
        left: width < 760 ? 58 : 74,
        right: width < 760 ? 72 : 78,
        top: 30,
        bottom: 64,
      };
      const chart = {
        x: pad.left,
        y: pad.top,
        w: width - pad.left - pad.right,
        h: height - pad.top - pad.bottom,
      };
      const sx = (x) => chart.x + (x / MAX_X) * chart.w;
      const sy = (y) => chart.y + (1 - Math.min(y, MAX_Y) / MAX_Y) * chart.h;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.font = "12px 'Microsoft YaHei', 'PingFang SC', sans-serif";
      ctx.fillStyle = "#2c2c2c";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      for (let x = 0; x <= MAX_X + 0.001; x += 0.5) {
        const px = sx(x);
        ctx.strokeStyle = Number.isInteger(x) ? "#dedede" : "#eeeeee";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, chart.y);
        ctx.lineTo(px, chart.y + chart.h);
        ctx.stroke();
        ctx.fillText(x.toFixed(1), px, chart.y + chart.h + 14);
      }

      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let y = 0; y <= MAX_Y; y += 20) {
        const py = sy(y);
        ctx.strokeStyle = "#e8e8e8";
        ctx.beginPath();
        ctx.moveTo(chart.x, py);
        ctx.lineTo(chart.x + chart.w, py);
        ctx.stroke();
        ctx.fillText(String(y), chart.x - 12, py);
      }

      ctx.strokeStyle = "#242424";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(chart.x, chart.y, chart.w, chart.h);

      let rightEdgeLabels = [];

      ctx.save();
      ctx.beginPath();
      ctx.rect(chart.x, chart.y, chart.w, chart.h);
      ctx.clip();

      const drawLine = (points, color, dashed) => {
        if (points.length < 2) return;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = dashed ? 2 : 3;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.setLineDash(dashed ? [7, 6] : []);
        ctx.beginPath();
        points.forEach((point, index) => {
          const px = sx(point.x);
          const py = sy(point.y);
          if (index === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.restore();
      };

      activeCurves.forEach((curve) => {
        drawLine(curve.measured, COLORS[curve.label], false);
      });

      if (showExtension) {
        activeCurves.forEach((curve) => {
          drawLine(curve.extension, COLORS[curve.label], true);
        });
      }

      if (showExtension) {
        activeCurves.forEach((curve) => {
          if (!curve.extension.length || !curve.measured.length) return;
          const end = curve.measured[curve.measured.length - 1];
          ctx.save();
          ctx.fillStyle = COLORS[curve.label];
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(sx(end.x), sy(end.y), 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        });
      }

      activeCurves.forEach((curve) => {
        const anchor = LABEL_AT[curve.label];
        const meta = summary.get(curve.label);
        if (!anchor || !meta || !curve.measured.length) return;
        const speed = displaySpeedForCurve(curve, meta);
        if (!speed) return;
        const point = nearestPoint(curve.measured, anchor.x);
        const px = Math.min(chart.x + chart.w - 62, Math.max(chart.x + 8, sx(point.x) + 6));
        const py = Math.min(chart.y + chart.h - 10, Math.max(chart.y + 18, sy(point.y + anchor.yOffset)));
        drawSpeedText(ctx, `${speed.toFixed(2)}/s`, px, py, COLORS[curve.label]);
      });

      if (showExtension) {
        const rightEdgePoints = activeCurves
          .map((curve) => {
            const visiblePoints = curve.extension.length ? curve.extension : curve.measured;
            const point = visiblePoints[visiblePoints.length - 1];
            return point ? { curve, point } : null;
          })
          .filter((item) => item && Math.abs(item.point.x - MAX_X) < 0.01 && item.point.y < MAX_Y - 0.01);

        if (rightEdgePoints.length) {
          const lowest = rightEdgePoints.reduce((best, item) => (item.point.y < best.point.y ? item : best), rightEdgePoints[0]);
          const highest = rightEdgePoints.reduce((best, item) => (item.point.y > best.point.y ? item : best), rightEdgePoints[0]);
          rightEdgeLabels = lowest === highest ? [lowest] : [lowest, highest];
        }
      }

      ctx.restore();

      rightEdgeLabels.forEach((item) => {
        const x = chart.x + chart.w + 8;
        const y = Math.min(chart.y + chart.h - 12, Math.max(chart.y + 12, sy(item.point.y)));
        drawMeterText(ctx, `${item.point.y.toFixed(0)}m`, x, y, COLORS[item.curve.label]);
      });

      activeCurves.forEach((curve) => {
        if (!TOP_TOUCH_LABELS.has(curve.label)) return;
        const topTouch = crossingAtY(curve.measured, MAX_Y);
        if (!topTouch) return;
        ctx.save();
        ctx.fillStyle = COLORS[curve.label];
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx(topTouch.x), chart.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        drawTopMeterText(ctx, `${MAX_Y}m`, sx(topTouch.x), chart.y - 6, COLORS[curve.label]);
      });

      ctx.save();
      ctx.font = "16px 'Microsoft YaHei', 'PingFang SC', sans-serif";
      ctx.fillStyle = "#202020";
      ctx.textAlign = "center";
      ctx.fillText("时间（秒）", chart.x + chart.w / 2, height - 24);
      ctx.translate(22, chart.y + chart.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("距离（米）", 0, 0);
      ctx.restore();

      canvas._chartLayout = { chart, sx, sy };
    };

    render();
    const observer = new ResizeObserver(render);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [activeCurves, showExtension, summary]);

  const handlePointerMove = (event) => {
    const canvas = canvasRef.current;
    const layout = canvas?._chartLayout;
    if (!canvas || !layout) return;
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    let best = null;

    activeCurves.forEach((curve) => {
      const points = showExtension ? [...curve.measured, ...curve.extension] : curve.measured;
      points.forEach((point) => {
        const dx = layout.sx(point.x) - px;
        const dy = layout.sy(point.y) - py;
        const dist = Math.hypot(dx, dy);
        if (dist < 14 && (!best || dist < best.dist)) {
          best = { curve, point, dist, x: layout.sx(point.x), y: layout.sy(point.y) };
        }
      });
    });

    if (!best) {
      setTooltip(null);
      return;
    }
    setTooltip({
      left: Math.min(rect.width - 150, Math.max(8, best.x + 12)),
      top: Math.min(rect.height - 74, Math.max(8, best.y - 56)),
      pointLeft: best.x,
      pointTop: best.y,
      label: best.curve.label,
      displayLabel: DISPLAY_LABELS[best.curve.label] ?? best.curve.label,
      time: best.point.x.toFixed(2),
      distance: best.point.y.toFixed(2),
      color: COLORS[best.curve.label],
    });
  };

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} onPointerMove={handlePointerMove} onPointerLeave={() => setTooltip(null)} />
      {tooltip ? (
        <>
          <span
            className="hover-point"
            style={{ left: tooltip.pointLeft, top: tooltip.pointTop, backgroundColor: tooltip.color }}
            aria-hidden="true"
          />
          <div className="tooltip" style={{ left: tooltip.left, top: tooltip.top, borderColor: tooltip.color }}>
            <strong>{tooltip.displayLabel}</strong>
            <span>{tooltip.time}s / {tooltip.distance}m</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ConclusionPanel() {
  return (
    <section className="conclusion-panel" aria-label="结论说明">
      <h2>结论</h2>

      <div className="conclusion-grid">
        <article>
          <h3>外服现状</h3>
          <ol>
            <li>
              玩家正常进行<strong>蹭墙踩头跳</strong>，约在 4s 情况下移动至 57m 处，后续以 8m/s 的速度前进。
            </li>
            <li>
              采用<strong>双抱连续丢扑</strong>的逻辑下，以底座玩家<strong>丢出后按扑的间隔</strong>为分组：
              <ul>
                <li>间隔为 0.3s 时，玩家可以连续抓扑 7 次，实际能在 11.8s 时到达 264m，落地后速度回到 8m/s。</li>
                <li>间隔为 0.4s 时，玩家可以连续抓扑 12 次，实际能在 17.3s 时到达 240m，落地后速度回到 8m/s。</li>
                <li>间隔为 0.5~0.6s 时，玩家可以无限抓扑，保持在约 9.8m/s 的速度；间隔为 0.7s 时会因为落地而无法反身抓举。</li>
              </ul>
            </li>
          </ol>
        </article>

        <article>
          <h3>操作流程</h3>
          <p>
            A 抓举 B → A 抓举 B 往前“移动” → A 抓举 B 往前“跳跃” → A 在空中将 B“丢出” → A 丢出后 B 立刻点“扑击”，
            同时 B 转身回抓正在扑的玩家 A → 此时玩家 A 变成顶抱，B 变成底座 → 玩家 B 再往前丢出 A，重复以上操作。
          </p>
        </article>

        <article>
          <h3>实现原理</h3>
          <ol>
            <li>玩家在高速移动情况下点击扑，会有短暂速度上升，后续再回落到 14m/s；底座玩家凭借这段加速效果，与丢出的玩家短暂保持在抓举距离范围内。</li>
            <li>被丢出的玩家快速转身抓举底座玩家，凭借特性让底座玩家瞬间加速到与被丢出的玩家速度一致，从而通过循环实现叠速。</li>
          </ol>
        </article>

        <article>
          <h3>修改逻辑</h3>
          <p>
            针对玩家高速状态下执行扑指令后的加速情况进行调整：玩家<strong>执行抓举（丢）指令后 0.6s 内再点击扑指令</strong>，
            不会有短暂加速效果，而是直接速度下降到 14m/s。
          </p>
          <p>影响范围：目前外服正常操作下不会因为此调整受影响。</p>
        </article>

        <article className="wide">
          <h3>修改结果</h3>
          <p>
            玩家在 4.5s 内（60m）情况下，<strong>正常蹭墙踩头跳始终快于双抱互抓情况</strong>，同时 0.3s 和 0.4s 的双抱距离存在有效限制。
          </p>
          <ol>
            <li>间隔为 0.3s 时，玩家可以连续抓扑 3 次，实际能在 6.8s 时到达 99m，落地后速度回到 8m/s，与正常踩头跳差距 20m。</li>
            <li>间隔为 0.4s 时，玩家可以连续抓扑 5 次，实际能在 9.0s 时到达 110m，落地后速度回到 8m/s，与正常踩头跳差距 13m。</li>
            <li>间隔为 0.5~0.6s 时，玩家仍可以无限抓扑，保持在约 9.8m/s 的速度；间隔为 0.7s 时会因为落地而无法反身抓举。</li>
          </ol>
        </article>
      </div>
    </section>
  );
}

export function App() {
  const { loading, curves, summary, error } = useChartData();
  const [visible, setVisible] = useState(() => Object.fromEntries(SERIES_ORDER.map((label) => [label, true])));
  const [showExtension, setShowExtension] = useState(true);

  const setGroup = (group) => {
    if (group === "all") {
      setVisible(Object.fromEntries(SERIES_ORDER.map((label) => [label, true])));
    } else if (group === "outer") {
      setVisible(Object.fromEntries(SERIES_ORDER.map((label) => [label, !label.startsWith("内服")])));
    } else if (group === "inner") {
      setVisible(Object.fromEntries(SERIES_ORDER.map((label) => [label, label.startsWith("内服")])));
    } else if (COMPARE_GROUPS[group]) {
      const groupSet = new Set(COMPARE_GROUPS[group]);
      setVisible(Object.fromEntries(SERIES_ORDER.map((label) => [label, groupSet.has(label)])));
    }
  };

  const selectedCount = Object.values(visible).filter(Boolean).length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">距离曲线对比</p>
          <h1>外服 / 内服</h1>
        </div>
        <div className="top-actions">
          <button type="button" onClick={() => setGroup("all")}>全部</button>
          <button type="button" onClick={() => setGroup("outer")}>外服</button>
          <button type="button" onClick={() => setGroup("inner")}>内服</button>
          {Object.keys(COMPARE_GROUPS).map((group) => (
            <button type="button" key={group} onClick={() => setGroup(group)}>{group}</button>
          ))}
        </div>
      </header>

      <section className="workspace">
        <aside className="controls" aria-label="曲线控制">
          <div className="control-head">
            <span>{selectedCount} / {SERIES_ORDER.length}</span>
            <div className="control-actions">
              <button
                type="button"
                className="clear-button"
                onClick={() => {
                  const nextValue = selectedCount === 0;
                  setVisible(Object.fromEntries(SERIES_ORDER.map((label) => [label, nextValue])));
                }}
              >
                {selectedCount === 0 ? "全选" : "取消全选"}
              </button>
              <label className="switch">
                <input type="checkbox" checked={showExtension} onChange={(event) => setShowExtension(event.target.checked)} />
                <span>延伸</span>
              </label>
            </div>
          </div>
          <div className="legend-list">
            {SERIES_ORDER.map((label) => {
              const meta = summary.get(label);
              const curve = curves.find((item) => item.label === label);
              const speed = curve && meta ? displaySpeedForCurve(curve, meta) : null;
              return (
                <label className="series-toggle" key={label}>
                  <input
                    type="checkbox"
                    checked={Boolean(visible[label])}
                    onChange={(event) => setVisible((current) => ({ ...current, [label]: event.target.checked }))}
                  />
                  <span className="swatch" style={{ backgroundColor: COLORS[label] }} />
                  <span className="series-name">{DISPLAY_LABELS[label] ?? label}</span>
                  <span className="speed">{speed ? `${speed.toFixed(2)}/s` : ""}</span>
                </label>
              );
            })}
          </div>
        </aside>

        <section className="chart-panel">
          {loading ? <div className="status">加载中</div> : null}
          {error ? <div className="status error">数据读取失败：{error}</div> : null}
          {!loading && !error ? <DistanceChart curves={curves} summary={summary} visible={visible} showExtension={showExtension} /> : null}
        </section>
      </section>

      <ConclusionPanel />
    </main>
  );
}
