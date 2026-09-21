import { useEffect, useRef } from "react";

const STRANDS = [0, 1, 2, 3, 4];
const BRANCHES = [0, 1, 2];
const WIDTH = 44;

function pointAt(t: number, strand: number, phase: number, height: number) {
  const envelope = Math.sin(Math.PI * t);
  const noise = Math.sin(t * 19 + phase * 1.3 + strand * 2.7)
    + 0.4 * Math.sin(t * 63 - phase * 2.1 + strand * 4.3);
  // All strands converge exactly at both nodes; outer strands favor opposite sides.
  const side = strand % 2 === 0 ? -1 : 1;
  const spread = strand === 0 ? 0 : side * (2 + strand * 0.6);
  const amplitude = strand === 0 ? 0.55 : 1.5;
  return [WIDTH / 2 + envelope * (spread + amplitude * noise), t * height];
}

function pathFor(points: number[][]) {
  return points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

export default function TimelineArc({ index }: { index: number }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const paths = Array.from(svg.querySelectorAll("[data-strand]")) as SVGPathElement[];
    const branches = Array.from(svg.querySelectorAll("[data-branch]")) as SVGPathElement[];
    const halo = svg.querySelector<SVGPathElement>(".timeline-arc__halo")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let height = Math.max(1, svg.getBoundingClientRect().height);
    let frame = 0;
    let lastFrame = -Infinity;
    let visible = false;

    const draw = (seconds: number) => {
      const phase = seconds * 2.4 + index * 2.31;
      const segments = Math.max(24, Math.ceil(height / 5));
      paths.forEach((path, strand) => {
        const points = Array.from({ length: segments + 1 }, (_, step) =>
          pointAt(step / segments, strand, phase, height));
        const d = pathFor(points);
        path.setAttribute("d", d);
        if (strand === 0) halo.setAttribute("d", d);
        const pulse = (Math.sin(phase * (1.2 + strand * 0.17) + strand * 2) + 1) / 2;
        path.style.opacity = String(strand === 0 ? 0.85 : 0.16 + pulse * 0.4);
      });
      branches.forEach((path, branch) => {
        const start = 0.14 + branch * 0.23;
        const points = Array.from({ length: 13 }, (_, step) => {
          const local = step / 12;
          const t = start + local * 0.2;
          const strand = branch + 1;
          const from = pointAt(t, strand, phase, height);
          const to = pointAt(t, 0, phase, height);
          return [from[0] * (1 - local) + to[0] * local
            + Math.sin(local * Math.PI) * Math.sin(local * 29 + phase) * 0.9, t * height];
        });
        path.setAttribute("d", pathFor(points));
        path.style.opacity = String(0.08 + Math.pow((Math.sin(phase * 1.7 + branch * 2.8) + 1) / 2, 3) * 0.34);
      });
    };

    const tick = (now: number) => {
      if (now - lastFrame >= 1000 / 30) {
        draw(now / 1000);
        lastFrame = now;
      }
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      if (!reduced.matches && visible && !document.hidden) frame = requestAnimationFrame(tick);
      else if (reduced.matches) draw(0);
    };
    const resize = new ResizeObserver(() => {
      height = Math.max(1, svg.getBoundingClientRect().height);
      svg.setAttribute("viewBox", `0 0 ${WIDTH} ${height}`);
      draw(reduced.matches ? 0 : performance.now() / 1000);
    });
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    resize.observe(svg);
    intersection.observe(svg);
    reduced.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    draw(0);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      reduced.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [index]);

  return (
    <svg ref={svgRef} className="timeline-arc" aria-hidden="true" focusable="false" preserveAspectRatio="none">
      <path className="timeline-arc__halo" />
      {STRANDS.map(strand => <path key={strand} data-strand={strand} className={strand === 0 ? "timeline-arc__core" : "timeline-arc__strand"} />)}
      {BRANCHES.map(branch => <path key={branch} data-branch={branch} className="timeline-arc__branch" />)}
    </svg>
  );
}
