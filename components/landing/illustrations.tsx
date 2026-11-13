import React from "react";

/**
 * Static, unlabelled inline SVG illustrations for the Cartograph landing page.
 * Per docs/specs/phase-13.md:
 * - Drawn, not captured (no screenshots)
 * - Unlabelled (no filenames or claims about real code)
 * - Static (nothing animates)
 * - Colors taken from the canvas palette (classes using Tailwind semantic theme tokens)
 * - Adapts cleanly between light and dark themes
 */

/**
 * Illustration 1: Topological Dependency Map
 * Shows structured nodes clustered by architectural tier with directional bezier edges.
 */
export function DependencyMapIllustration() {
  return (
    <div className="relative w-full aspect-4/3 max-w-[480px] mx-auto rounded-xl border border-border/80 bg-card/60 p-4 shadow-xs overflow-hidden select-none">
      <svg
        viewBox="0 0 460 340"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full text-foreground"
      >
        <defs>
          {/* Subtle grid pattern */}
          <pattern id="canvas-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-muted-foreground/10"
            />
          </pattern>
          {/* Edge arrow marker */}
          <marker
            id="edge-arrow"
            viewBox="0 0 6 6"
            refX="5"
            refY="3"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 6 3 L 0 6 z" fill="currentColor" className="text-muted-foreground/40" />
          </marker>
          <marker
            id="edge-arrow-active"
            viewBox="0 0 6 6"
            refX="5"
            refY="3"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 6 3 L 0 6 z" fill="currentColor" className="text-sky-500" />
          </marker>
        </defs>

        {/* Background Grid */}
        <rect width="100%" height="100%" fill="url(#canvas-grid)" />

        {/* Cluster 1: Entry / Routes Container */}
        <rect
          x="20"
          y="30"
          width="110"
          height="280"
          rx="8"
          className="stroke-border/60 fill-muted/15"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        {/* Cluster 2: Controllers / Middleware Container */}
        <rect
          x="175"
          y="40"
          width="110"
          height="260"
          rx="8"
          className="stroke-border/60 fill-muted/15"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        {/* Cluster 3: Services / Models Container */}
        <rect
          x="330"
          y="60"
          width="110"
          height="220"
          rx="8"
          className="stroke-border/60 fill-muted/15"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        {/* Dependency Edges (Connecting Bezier Curves) */}
        {/* Neutral edges */}
        <path
          d="M 105 70 C 140 70, 140 90, 175 90"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          className="text-border"
          markerEnd="url(#edge-arrow)"
        />
        <path
          d="M 105 130 C 140 130, 140 90, 175 90"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          className="text-border"
          markerEnd="url(#edge-arrow)"
        />
        <path
          d="M 105 190 C 140 190, 140 160, 175 160"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          className="text-border"
          markerEnd="url(#edge-arrow)"
        />
        <path
          d="M 105 250 C 140 250, 140 230, 175 230"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          className="text-border"
          markerEnd="url(#edge-arrow)"
        />
        <path
          d="M 260 160 C 295 160, 295 190, 330 190"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          className="text-border"
          markerEnd="url(#edge-arrow)"
        />
        <path
          d="M 260 230 C 295 230, 295 190, 330 190"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          className="text-border"
          markerEnd="url(#edge-arrow)"
        />

        {/* Highlighted resolved path in sky blue */}
        <path
          d="M 105 70 C 140 70, 140 160, 175 160"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className="text-sky-500/80"
          markerEnd="url(#edge-arrow-active)"
        />
        <path
          d="M 260 90 C 295 90, 295 110, 330 110"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className="text-sky-500/80"
          markerEnd="url(#edge-arrow-active)"
        />
        <path
          d="M 260 160 C 295 160, 295 110, 330 110"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className="text-sky-500/80"
          markerEnd="url(#edge-arrow-active)"
        />

        {/* Column 1 Nodes (Routes / Pages) */}
        <g className="cursor-default">
          <rect x="35" y="52" width="70" height="34" rx="5" className="fill-card stroke-sky-500/50" strokeWidth="1" />
          <line x1="45" y1="65" x2="80" y2="65" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-sky-400" />
          <line x1="45" y1="73" x2="65" y2="73" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground/40" />

          <rect x="35" y="112" width="70" height="34" rx="5" className="fill-card stroke-sky-500/50" strokeWidth="1" />
          <line x1="45" y1="125" x2="85" y2="125" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-sky-400" />
          <line x1="45" y1="133" x2="70" y2="133" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground/40" />

          <rect x="35" y="172" width="70" height="34" rx="5" className="fill-card stroke-border" strokeWidth="1" />
          <line x1="45" y1="185" x2="75" y2="185" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-muted-foreground/70" />
          <line x1="45" y1="193" x2="60" y2="193" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground/30" />

          <rect x="35" y="232" width="70" height="34" rx="5" className="fill-card stroke-border" strokeWidth="1" />
          <line x1="45" y1="245" x2="78" y2="245" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-muted-foreground/70" />
          <line x1="45" y1="253" x2="62" y2="253" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground/30" />
        </g>

        {/* Column 2 Nodes (Controllers / Middleware) */}
        <g className="cursor-default">
          <rect x="190" y="72" width="70" height="34" rx="5" className="fill-card stroke-amber-500/50" strokeWidth="1" />
          <line x1="200" y1="85" x2="240" y2="85" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-amber-400" />
          <line x1="200" y1="93" x2="225" y2="93" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground/40" />

          <rect x="190" y="142" width="70" height="34" rx="5" className="fill-card stroke-sky-500/60" strokeWidth="1.5" />
          <line x1="200" y1="155" x2="245" y2="155" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-sky-400" />
          <line x1="200" y1="163" x2="230" y2="163" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground/50" />

          <rect x="190" y="212" width="70" height="34" rx="5" className="fill-card stroke-border" strokeWidth="1" />
          <line x1="200" y1="225" x2="235" y2="225" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-muted-foreground/70" />
          <line x1="200" y1="233" x2="218" y2="233" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground/30" />
        </g>

        {/* Column 3 Nodes (Services / Models / Utilities) */}
        <g className="cursor-default">
          <rect x="345" y="92" width="75" height="36" rx="5" className="fill-card stroke-emerald-500/60" strokeWidth="1.5" />
          <line x1="355" y1="106" x2="400" y2="106" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-emerald-400" />
          <line x1="355" y1="115" x2="385" y2="115" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground/50" />

          <rect x="345" y="172" width="75" height="36" rx="5" className="fill-card stroke-border" strokeWidth="1" />
          <line x1="355" y1="186" x2="395" y2="186" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-muted-foreground/70" />
          <line x1="355" y1="195" x2="375" y2="195" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground/30" />
        </g>
      </svg>
    </div>
  );
}

/**
 * Illustration 2: Blast Radius and Cycle Detection Graph Math
 * Illustrates pure graph algorithms: inbound blast radius traversal and loop cycle detection.
 */
export function BlastRadiusIllustration() {
  return (
    <div className="relative w-full aspect-4/3 max-w-[480px] mx-auto rounded-xl border border-border/80 bg-card/60 p-4 shadow-xs overflow-hidden select-none">
      <svg
        viewBox="0 0 460 340"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full text-foreground"
      >
        <defs>
          <pattern id="blast-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-muted-foreground/10"
            />
          </pattern>
          <marker
            id="blast-arrow-inbound"
            viewBox="0 0 6 6"
            refX="5"
            refY="3"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 6 3 L 0 6 z" fill="currentColor" className="text-rose-500" />
          </marker>
          <marker
            id="blast-arrow-cycle"
            viewBox="0 0 6 6"
            refX="5"
            refY="3"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 6 3 L 0 6 z" fill="currentColor" className="text-amber-500" />
          </marker>
        </defs>

        <rect width="100%" height="100%" fill="url(#blast-grid)" />

        {/* Blast radius impact wavefront */}
        <circle cx="230" cy="170" r="110" className="stroke-rose-500/20 fill-rose-500/5" strokeWidth="1" strokeDasharray="4 4" />
        <circle cx="230" cy="170" r="60" className="stroke-rose-500/30 fill-rose-500/10" strokeWidth="1" strokeDasharray="2 2" />

        {/* Circular Dependency Loop (Top-Right) */}
        <path
          d="M 330 65 C 375 65, 395 105, 375 140 C 355 175, 310 150, 315 110"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          className="text-amber-500/80"
          markerEnd="url(#blast-arrow-cycle)"
        />

        {/* Inbound Blast Radius Paths Converging to Focal Node */}
        <path
          d="M 90 70 C 140 70, 170 140, 205 160"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className="text-rose-500/80"
          markerEnd="url(#blast-arrow-inbound)"
        />
        <path
          d="M 80 170 C 130 170, 160 170, 205 170"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className="text-rose-500/80"
          markerEnd="url(#blast-arrow-inbound)"
        />
        <path
          d="M 90 270 C 140 270, 170 200, 205 180"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className="text-rose-500/80"
          markerEnd="url(#blast-arrow-inbound)"
        />

        {/* Outbound unaffected paths */}
        <path
          d="M 255 170 C 295 170, 320 230, 350 245"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          className="text-border"
        />

        {/* Focal Node Being Changed */}
        <g>
          <rect x="205" y="148" width="50" height="44" rx="6" className="fill-card stroke-rose-500" strokeWidth="2" />
          <circle cx="230" cy="170" r="5" className="fill-rose-500" />
        </g>

        {/* Affected Inbound Dependent Nodes (Blast Radius) */}
        <g>
          <rect x="50" y="52" width="40" height="36" rx="5" className="fill-card stroke-rose-500/60" strokeWidth="1" />
          <circle cx="70" cy="70" r="3.5" className="fill-rose-400" />

          <rect x="40" y="152" width="40" height="36" rx="5" className="fill-card stroke-rose-500/60" strokeWidth="1" />
          <circle cx="60" cy="170" r="3.5" className="fill-rose-400" />

          <rect x="50" y="252" width="40" height="36" rx="5" className="fill-card stroke-rose-500/60" strokeWidth="1" />
          <circle cx="70" cy="270" r="3.5" className="fill-rose-400" />
        </g>

        {/* Unaffected Downstream Nodes */}
        <g>
          <rect x="350" y="228" width="44" height="34" rx="5" className="fill-card stroke-border" strokeWidth="1" />
          <circle cx="372" cy="245" r="3" className="fill-muted-foreground/40" />

          {/* Nodes in Circular Dependency */}
          <rect x="310" y="50" width="44" height="34" rx="5" className="fill-card stroke-amber-500/60" strokeWidth="1.25" />
          <circle cx="332" cy="67" r="3" className="fill-amber-400" />

          <rect x="355" y="125" width="44" height="34" rx="5" className="fill-card stroke-amber-500/60" strokeWidth="1.25" />
          <circle cx="377" cy="142" r="3" className="fill-amber-400" />
        </g>
      </svg>
    </div>
  );
}

/**
 * Illustration 3: Framework Taxonomy Extraction
 * Shows route endpoints branching into middleware, controllers, and services.
 */
export function FrameworkTaxonomyIllustration() {
  return (
    <div className="relative w-full aspect-4/3 max-w-[480px] mx-auto rounded-xl border border-border/80 bg-card/60 p-4 shadow-xs overflow-hidden select-none">
      <svg
        viewBox="0 0 460 340"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full text-foreground"
      >
        <defs>
          <pattern id="framework-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-muted-foreground/10"
            />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="url(#framework-grid)" />

        {/* Tier 1: Routes Header Line */}
        <g className="cursor-default">
          {/* Route HTTP Method Badges */}
          <rect x="40" y="45" width="75" height="28" rx="4" className="fill-emerald-500/10 stroke-emerald-500/40" strokeWidth="1" />
          <circle cx="56" cy="59" r="3.5" className="fill-emerald-500" />
          <line x1="68" y1="59" x2="100" y2="59" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-emerald-400/80" />

          <rect x="40" y="115" width="75" height="28" rx="4" className="fill-sky-500/10 stroke-sky-500/40" strokeWidth="1" />
          <circle cx="56" cy="129" r="3.5" className="fill-sky-500" />
          <line x1="68" y1="129" x2="104" y2="129" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-sky-400/80" />

          <rect x="40" y="185" width="75" height="28" rx="4" className="fill-amber-500/10 stroke-amber-500/40" strokeWidth="1" />
          <circle cx="56" cy="199" r="3.5" className="fill-amber-500" />
          <line x1="68" y1="199" x2="98" y2="199" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-amber-400/80" />

          <rect x="40" y="255" width="75" height="28" rx="4" className="fill-rose-500/10 stroke-rose-500/40" strokeWidth="1" />
          <circle cx="56" cy="269" r="3.5" className="fill-rose-500" />
          <line x1="68" y1="269" x2="96" y2="269" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-rose-400/80" />
        </g>

        {/* Branching Connectors */}
        <path d="M 115 59 C 150 59, 160 100, 195 100" fill="none" stroke="currentColor" strokeWidth="1.25" className="text-border" />
        <path d="M 115 129 C 150 129, 160 100, 195 100" fill="none" stroke="currentColor" strokeWidth="1.25" className="text-border" />
        <path d="M 115 199 C 150 199, 160 170, 195 170" fill="none" stroke="currentColor" strokeWidth="1.25" className="text-border" />
        <path d="M 115 269 C 150 269, 160 240, 195 240" fill="none" stroke="currentColor" strokeWidth="1.25" className="text-border" />

        <path d="M 275 100 C 305 100, 315 130, 345 130" fill="none" stroke="currentColor" strokeWidth="1.25" className="text-border" />
        <path d="M 275 170 C 305 170, 315 130, 345 130" fill="none" stroke="currentColor" strokeWidth="1.25" className="text-border" />
        <path d="M 275 240 C 305 240, 315 210, 345 210" fill="none" stroke="currentColor" strokeWidth="1.25" className="text-border" />

        {/* Tier 2: Controllers & Middleware */}
        <g>
          <rect x="195" y="80" width="80" height="40" rx="5" className="fill-card stroke-border" strokeWidth="1" />
          <line x1="208" y1="95" x2="255" y2="95" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground/70" />
          <line x1="208" y1="105" x2="238" y2="105" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground/40" />

          <rect x="195" y="150" width="80" height="40" rx="5" className="fill-card stroke-border" strokeWidth="1" />
          <line x1="208" y1="165" x2="260" y2="165" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground/70" />
          <line x1="208" y1="175" x2="242" y2="175" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground/40" />

          <rect x="195" y="220" width="80" height="40" rx="5" className="fill-card stroke-border" strokeWidth="1" />
          <line x1="208" y1="235" x2="250" y2="235" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground/70" />
          <line x1="208" y1="245" x2="232" y2="245" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground/40" />
        </g>

        {/* Tier 3: Core Domain Services */}
        <g>
          <rect x="345" y="108" width="85" height="44" rx="5" className="fill-card stroke-sky-500/50" strokeWidth="1.25" />
          <line x1="358" y1="125" x2="410" y2="125" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-sky-400" />
          <line x1="358" y1="135" x2="390" y2="135" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground/40" />

          <rect x="345" y="188" width="85" height="44" rx="5" className="fill-card stroke-border" strokeWidth="1" />
          <line x1="358" y1="205" x2="415" y2="205" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-muted-foreground/70" />
          <line x1="358" y1="215" x2="385" y2="215" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground/40" />
        </g>
      </svg>
    </div>
  );
}
